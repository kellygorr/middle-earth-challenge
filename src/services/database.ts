import { open, type DB } from '@op-engineering/op-sqlite';
import {
  UserSettings,
  LabelSize,
  TextSize,
  SyncProvider,
  TrackingMode,
  DistanceEntry,
  DistanceSource,
  FriendAffinity,
} from '../types';
import { ThemeName } from '../styles/themes';
import { AVERAGE_STRIDE_METERS, METERS_TO_MILES } from '../utils/stride';
import { DEFAULT_SAVE_ID } from '../constants/gameConstants';
import { shouldForceUpgradeMigrationFailureForDev } from './devSyncMock';

const CURRENT_PROGRESS_CACHE_VERSION = 1;
export const CURRENT_HEALTH_SYNC_FORMAT_VERSION = 1;

// Bump this whenever a new data-affecting migration is added below. On
// upgrade, any existing install (schema_meta.version > 0) whose stored
// version is behind this one gets a fresh pre-migration snapshot taken
// before the (otherwise idempotent, low-risk) ALTER TABLE migrations run.
export const CURRENT_SCHEMA_VERSION = 1;
export const PRE_MIGRATION_SNAPSHOT_DB_NAME =
  'MiddleEarthSettings.premigration.db';
const PRE_MIGRATION_SNAPSHOT_ALIAS = 'pre_migration_snapshot';

// A stored version of 0 means either a brand-new install or one that
// predates schema_meta — there is no prior recorded version to compare
// against, so there is nothing yet worth protecting on this transition.
export function needsPreMigrationSnapshot(
  storedSchemaVersion: number,
  currentSchemaVersion: number,
): boolean {
  return storedSchemaVersion > 0 && storedSchemaVersion < currentSchemaVersion;
}

// Distinguishes a genuinely brand-new install from a legacy install that
// predates `schema_meta` entirely (e.g. a real 1.1.3 database migrating to
// 1.1.4 for the very first time). `needsPreMigrationSnapshot` alone cannot
// tell these apart: both read back `storedSchemaVersion === 0` the first
// time `schema_meta` is created (`CREATE TABLE IF NOT EXISTS` + `INSERT OR
// IGNORE ... VALUES (1, 0)` always produces that default), so the
// version-compare check sees identical input for "nothing to protect" and
// "this is exactly the one case that most needs protecting" — the first
// time a real user's irreplaceable history ever runs a migration at all.
//
// The distinguishing fact instead has to come from table existence,
// checked BEFORE `schema_meta` or `distance_entries` are created by this
// run: a legacy pre-1.1.3-tracking database already has `distance_entries`
// (created by the old app version) but has never had `schema_meta` (it
// didn't exist as a concept yet), while a true fresh install has neither
// table yet — `distance_entries` isn't created until later in
// `runSchemaMigrations()`, well after this check runs.
export function isLegacyUpgradeMissingSchemaMeta(
  schemaMetaTableExisted: boolean,
  distanceEntriesTableExisted: boolean,
): boolean {
  return !schemaMetaTableExisted && distanceEntriesTableExisted;
}

export interface DistanceEntryChanges {
  upsert?: DistanceEntry[];
  removeIds?: string[];
  removeSources?: DistanceSource[];
  clearAll?: boolean;
}

export interface ProgressMutation {
  miles: number;
  steps: number;
  changes: DistanceEntryChanges;
}

type AppliedProgressMutation =
  | (ProgressMutation & { applied: true })
  | { applied: false };

export interface DistanceEntryPage {
  entries: DistanceEntry[];
  nextCursor: { date: number; id: string } | null;
}

export interface DistanceDaySummary {
  date: number;
  miles: number;
  steps: number;
}

export interface JourneyBackup {
  app: 'MiddleEarthChallenge';
  schemaVersion: 1 | 2;
  exportedAt: string;
  settings: {
    labelSize: LabelSize;
    textSize: TextSize;
    currentTheme: ThemeName;
    showPointLabels: boolean;
    colorizeMap: boolean;
    reducedMapTitles: boolean;
    devMode: boolean;
    useMiles: boolean;
    lastNotifiedCheckpointIndex: number;
  };
  distanceEntries: DistanceEntry[];
  troubleshootingIssues: Array<{
    slot: string;
    error: unknown;
    at: number;
    dismissedAt: number | null;
    resolvedAt: number | null;
  }>;
  sharing?: {
    enabled: boolean;
    userId: string | null;
    displayName: string | null;
    affinity: FriendAffinity | null;
  };
}

// SQLite raises a generic error for "duplicate column" from ALTER TABLE
// ADD COLUMN when the column already exists. There's no dedicated error
// code we can rely on across engines, so we string-match. Any other
// migration error (syntax error, disk full, corruption) rethrows so we
// see it during dev rather than silently corrupting state.
function isDuplicateColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /duplicate column/i.test(message);
}

// Coerce legacy 'regular' (pre-three-tier label size) to 'medium'.
function normalizeLabelSize(value: unknown): LabelSize {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
}

function normalizeTextSize(value: unknown): TextSize {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
}

function reconciliationDayEndFromId(id: string): number | null {
  const match = /^health_reconciliation_(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dayStart = new Date(year, month, day);
  if (
    dayStart.getFullYear() !== year ||
    dayStart.getMonth() !== month ||
    dayStart.getDate() !== day
  ) {
    return null;
  }

  const nextDay = new Date(year, month, day + 1);
  return nextDay.getTime() - 1;
}

class Database {
  private db: DB | null = null;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  // Set by createTables() during this launch's init() call — true only when
  // this launch ran a protected (pre-migration-snapshotted) schema upgrade,
  // which includes both a normal version-behind upgrade and a legacy
  // pre-schema_meta database's very first migration. Read by the UI layer
  // (App.tsx) to show "Upgrading" instead of "Loading" on the splash
  // screen — see isLegacyUpgradeMissingSchemaMeta()'s docstring for why
  // that legacy case specifically needs its own detection.
  private wasProtectedUpgrade = false;

  /**
   * Whether the most recent `init()` attempt detected (and attempted, via
   * `migrateWithSnapshotProtection`) a protected legacy-schema upgrade —
   * readable even when that attempt ultimately threw (unlike `init()`'s own
   * return value, which is only available on success). `createTables()`
   * sets `wasProtectedUpgrade` BEFORE calling `migrateWithSnapshotProtection`
   * (the step that can actually throw), so this is reliable to check
   * immediately after catching a rejected `init()` call — it tells the
   * caller whether the failure happened while migrating a real user's
   * existing data (versus, say, a fresh install hitting an unrelated disk
   * error), which is exactly the distinction the bootstrap error screen
   * needs to show upgrade-specific guidance instead of generic copy.
   */
  wasProtectedUpgradeAttempt(): boolean {
    return this.wasProtectedUpgrade;
  }

  async init(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
      return this.wasProtectedUpgrade;
    }
    if (this.db) return this.wasProtectedUpgrade;

    const initPromise = this.initialize();
    this.initPromise = initPromise;
    try {
      await initPromise;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = null;
      }
    }
    return this.wasProtectedUpgrade;
  }

  private async initialize(): Promise<void> {
    // Reset at the start of every real init attempt (not just once at
    // construction) so a retry after a prior failed init — see "closes a
    // partial handle and permits retry after initialization fails" in
    // database.test.ts — recomputes this fresh rather than carrying over a
    // stale value from an attempt that never actually finished.
    this.wasProtectedUpgrade = false;
    const db = open({
      name: 'MiddleEarthSettings.db',
    });
    this.db = db;

    try {
      await this.createTables();
      await this.initializeDefaultSettings();
    } catch (error) {
      if (this.db === db) {
        try {
          db.close();
        } finally {
          this.db = null;
        }
      }
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Checked BEFORE either table is created by this run — see
    // isLegacyUpgradeMissingSchemaMeta()'s docstring for why table
    // existence, not the version number read back below, is the only
    // reliable signal for the legacy-first-migration case.
    const existingTables = this.db.executeSync(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('schema_meta', 'distance_entries')`,
    ).rows as { name: string }[] | undefined;
    const existingTableNames = new Set(
      (existingTables ?? []).map(row => row.name),
    );
    const schemaMetaTableExisted = existingTableNames.has('schema_meta');
    const distanceEntriesTableExisted =
      existingTableNames.has('distance_entries');

    // Tracks the last fully-applied schema version so we know whether an
    // upgrading install needs a pre-migration snapshot below. A fresh
    // install (no row yet) starts at 0 and never needs one — there is no
    // prior user data to protect.
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.db.executeSync(
      `INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 0)`,
    );
    const schemaMetaRow = this.db.executeSync(
      `SELECT version FROM schema_meta WHERE id = 1`,
    ).rows?.[0] as { version?: number } | undefined;
    const storedSchemaVersion = Number(schemaMetaRow?.version ?? 0);

    // Either signal alone can indicate a protected upgrade: a recorded
    // version behind current (needsPreMigrationSnapshot), or a legacy
    // database migrating through schema_meta tracking for the very first
    // time (isLegacyUpgradeMissingSchemaMeta) — see that function's
    // docstring for why the version-compare check alone misses this case
    // entirely (it reads storedSchemaVersion === 0 for both "nothing to
    // protect" and "this is exactly the case that most needs protecting").
    const isProtectedUpgrade =
      needsPreMigrationSnapshot(storedSchemaVersion, CURRENT_SCHEMA_VERSION) ||
      isLegacyUpgradeMissingSchemaMeta(
        schemaMetaTableExisted,
        distanceEntriesTableExisted,
      );
    this.wasProtectedUpgrade = isProtectedUpgrade;
    this.migrateWithSnapshotProtection(isProtectedUpgrade);

    // dev-only: lets the upgrade-failure bootstrap error copy be visually
    // reviewed without needing to actually break a real migration — see
    // shouldForceUpgradeMigrationFailureForDev()'s docstring. Thrown AFTER
    // migrateWithSnapshotProtection() succeeds (not instead of it) so the
    // live database is left in a normal, fully-migrated state — this is
    // purely a visual test of the error screen's copy/retry flow, not a
    // test of actual migration-failure recovery.
    if (shouldForceUpgradeMigrationFailureForDev()) {
      throw new Error('[dev] Simulated upgrade migration failure');
    }

    this.db.executeSync(`UPDATE schema_meta SET version = ? WHERE id = 1`, [
      CURRENT_SCHEMA_VERSION,
    ]);
  }

  // Split out from createTables() so tests can exercise the
  // snapshot/restore/retry orchestration directly, independent of whatever
  // the real stored-vs-current schema version happens to be at any given
  // time (there may be no real migration currently behind CURRENT_SCHEMA_VERSION
  // to naturally trigger this).
  private migrateWithSnapshotProtection(isProtectedUpgrade: boolean): void {
    if (isProtectedUpgrade) {
      this.createPreMigrationSnapshot();
    }

    try {
      this.runSchemaMigrations();
    } catch (error) {
      // Nothing to fall back to — same failure mode as before this feature
      // existed (fresh install, or a version we don't protect yet).
      if (!isProtectedUpgrade) throw error;

      // A migration failing mid-way can leave the live database in a
      // half-migrated, inconsistent state — worse than either the old or
      // new schema. Restore the clean pre-migration snapshot and retry
      // once: if the original failure was transient (e.g. a momentary disk
      // error), this succeeds and the update proceeds normally; if it's a
      // real bug, the user still ends up with a working app on the old
      // schema instead of a bricked install.
      this.restoreFromPreMigrationSnapshot();
      this.runSchemaMigrations();
    }
  }

  private createPreMigrationSnapshot(): void {
    if (!this.db) throw new Error('Database not initialized');

    // VACUUM INTO refuses to write to a path that already exists, so clear
    // out any snapshot left over from a prior schema-version bump first.
    // Opening it (rather than guessing its path) guarantees the file exists
    // and sits next to the live database, and delete() closes the handle.
    const staleSnapshot = open({ name: PRE_MIGRATION_SNAPSHOT_DB_NAME });
    const snapshotPath = staleSnapshot.getDbPath();
    staleSnapshot.delete();

    const escapedPath = snapshotPath.replace(/'/g, "''");
    this.db.executeSync(`VACUUM INTO '${escapedPath}'`);
  }

  private restoreFromPreMigrationSnapshot(): void {
    if (!this.db) throw new Error('Database not initialized');

    const snapshotHandle = open({ name: PRE_MIGRATION_SNAPSHOT_DB_NAME });
    const snapshotPath = snapshotHandle.getDbPath();
    snapshotHandle.close();

    const escapedPath = snapshotPath.replace(/'/g, "''");
    // ATTACH (and DETACH, in the finally below) must run outside any
    // transaction — SQLite rejects both inside one — so only the table
    // rebuild itself is wrapped in BEGIN/COMMIT below.
    this.db.executeSync(
      `ATTACH DATABASE '${escapedPath}' AS ${PRE_MIGRATION_SNAPSHOT_ALIAS}`,
    );

    try {
      // Rebuild every live table from the snapshot's own schema rather than
      // patching columns in place — a migration can fail after adding only
      // some of its columns, so the live schema at this point is unknown
      // and untrusted. Recreating from the snapshot's CREATE TABLE text is
      // the only way to guarantee an exact revert.
      //
      // The whole rebuild runs as one transaction: a mid-loop failure (disk
      // error, killed process) must not leave some tables restored and
      // others dropped-but-not-recreated, which would be strictly worse
      // than the half-migrated state this function exists to fix.
      this.runTransaction(() => {
        const tables = (this.db!.executeSync(
          `SELECT name, sql FROM ${PRE_MIGRATION_SNAPSHOT_ALIAS}.sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        ).rows ?? []) as Array<{ name: string; sql: string }>;

        for (const table of tables) {
          this.db!.executeSync(`DROP TABLE IF EXISTS "${table.name}"`);
          this.db!.executeSync(table.sql);
          this.db!.executeSync(
            `INSERT INTO "${table.name}" SELECT * FROM ${PRE_MIGRATION_SNAPSHOT_ALIAS}."${table.name}"`,
          );
        }

        // A migration can fail after CREATE TABLE-ing a brand-new table
        // (the same pattern runSchemaMigrations() already uses for
        // user_settings, distance_entries, etc. via CREATE TABLE IF NOT
        // EXISTS) but before that table existed in the snapshot. Restoring
        // only the tables the snapshot knows about would leave that
        // partially-migrated table behind, which is not an exact revert.
        // Drop anything live that isn't in the snapshot too — except
        // schema_meta, which must survive so the version this restore is
        // rolling back to remains correctly recorded.
        const snapshotTableNames = new Set(tables.map(table => table.name));
        const liveTables = (this.db!.executeSync(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        ).rows ?? []) as Array<{ name: string }>;
        for (const { name } of liveTables) {
          if (name === 'schema_meta' || snapshotTableNames.has(name)) continue;
          this.db!.executeSync(`DROP TABLE IF EXISTS "${name}"`);
        }

        const indexes = (this.db!.executeSync(
          `SELECT sql FROM ${PRE_MIGRATION_SNAPSHOT_ALIAS}.sqlite_master
           WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL`,
        ).rows ?? []) as Array<{ sql: string }>;
        for (const index of indexes) {
          this.db!.executeSync(index.sql);
        }
      });
    } finally {
      this.db.executeSync(`DETACH DATABASE ${PRE_MIGRATION_SNAPSHOT_ALIAS}`);
    }
  }

  private runSchemaMigrations(): void {
    if (!this.db) throw new Error('Database not initialized');

    // User settings table - simple key-value style for app preferences
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id TEXT PRIMARY KEY,
        label_size TEXT NOT NULL DEFAULT 'medium',
        text_size TEXT NOT NULL DEFAULT 'medium',
        current_theme TEXT NOT NULL DEFAULT 'minimalist',
        show_checkpoint_labels INTEGER NOT NULL DEFAULT 1,
        colorize_map INTEGER NOT NULL DEFAULT 1,
        reduced_map_titles INTEGER NOT NULL DEFAULT 1,
        dev_mode INTEGER NOT NULL DEFAULT 0,
        use_miles INTEGER NOT NULL DEFAULT 1,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        sync_provider TEXT NOT NULL DEFAULT 'none',
        sync_start_date INTEGER,
        last_sync_timestamp INTEGER,
        pedometer_cursor TEXT,
        health_sync_format_version INTEGER NOT NULL DEFAULT ${CURRENT_HEALTH_SYNC_FORMAT_VERSION},
        health_lookback_start_timestamp INTEGER,
        last_health_reconciled_through INTEGER,
        live_sync_enabled INTEGER NOT NULL DEFAULT 0,
        tracking_mode TEXT NOT NULL DEFAULT 'health-app',
        has_seen_oem_battery_prompt INTEGER NOT NULL DEFAULT 0,
        hc_revoke_pending_restart INTEGER NOT NULL DEFAULT 0,
        pedometer_cleanup_pending INTEGER NOT NULL DEFAULT 0,
        last_notified_checkpoint_index INTEGER NOT NULL DEFAULT -1,
        sharing_enabled INTEGER NOT NULL DEFAULT 0,
        sharing_display_name TEXT,
        sharing_affinity_selection TEXT,
        sharing_provisioning_pending INTEGER NOT NULL DEFAULT 0,
        sharing_deletion_pending INTEGER NOT NULL DEFAULT 0,
        sharing_migration_source_user_id TEXT,
        last_published_miles REAL,
        last_shared_progress_sync_at INTEGER,
        last_journey_backup_file_name TEXT
      )
    `);

    // Tracking issues the user can review in Settings. Keyed by slot so a
    // repeat fault updates in place rather than accumulating duplicates.
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS troubleshooting_issues (
        slot TEXT PRIMARY KEY,
        error TEXT NOT NULL,
        at INTEGER NOT NULL,
        dismissed_at INTEGER,
        resolved_at INTEGER
      )
    `);

    // Migration: add text_size column for installs that pre-date it.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN pedometer_cursor TEXT`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN text_size TEXT NOT NULL DEFAULT 'medium'`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // Migration: add tracking_mode column for installs that pre-date it.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'health-app'`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // Migration: add has_seen_oem_battery_prompt column for installs
    // that pre-date the OEM battery follow-up prompt.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN has_seen_oem_battery_prompt INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // Migration: add hc_revoke_pending_restart column. Persisted so
    // the "restart to reset" indicator on the Health Connect Required
    // Access items survives modal close/reopen and JS reloads — HC
    // itself only clears the stale grants after a full native process
    // restart, so a session-scoped flag would lie to the user.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN hc_revoke_pending_restart INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN pedometer_cleanup_pending INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // Migration: add last_notified_checkpoint_index. -1 = no milestone
    // notification fired yet. Used by the pedometer commit path to
    // avoid re-notifying for a checkpoint already announced (e.g. if
    // the same watermark window is re-processed after a retry or dev
    // action).
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN last_notified_checkpoint_index INTEGER NOT NULL DEFAULT -1`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN last_health_reconciled_through INTEGER`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // Existing LIVE installs use raw Health Connect record IDs. Fresh NEW
    // installs start directly on aggregate IDs; upgraded rows must complete a
    // final raw-ID sync before moving to format 1.
    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN health_sync_format_version INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    try {
      this.db.executeSync(
        `ALTER TABLE user_settings ADD COLUMN health_lookback_start_timestamp INTEGER`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    const sharingMigrations = [
      `ALTER TABLE user_settings ADD COLUMN sharing_enabled INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE user_settings ADD COLUMN sharing_display_name TEXT`,
      `ALTER TABLE user_settings ADD COLUMN sharing_affinity_selection TEXT`,
      `ALTER TABLE user_settings ADD COLUMN sharing_provisioning_pending INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE user_settings ADD COLUMN sharing_deletion_pending INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE user_settings ADD COLUMN sharing_migration_source_user_id TEXT`,
      `ALTER TABLE user_settings ADD COLUMN last_published_miles REAL`,
      `ALTER TABLE user_settings ADD COLUMN last_shared_progress_sync_at INTEGER`,
      `ALTER TABLE user_settings ADD COLUMN last_journey_backup_file_name TEXT`,
    ];
    for (const migration of sharingMigrations) {
      try {
        this.db.executeSync(migration);
      } catch (error) {
        if (!isDuplicateColumnError(error)) throw error;
      }
    }

    // Distance entries table
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS distance_entries (
        id TEXT PRIMARY KEY,
        save_id TEXT NOT NULL,
        date INTEGER NOT NULL, -- Unix timestamp (ms)
        miles REAL NOT NULL,
        steps INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual' -- 'manual' | 'health-connect' | 'apple-health' | 'pedometer'
      )
    `);
    this.db.executeSync(
      `CREATE INDEX IF NOT EXISTS idx_distance_entries_save_date
       ON distance_entries (save_id, date)`,
    );

    // Add `steps` column to existing installs. Backfills from `miles`
    // using the stride constants so legacy rows still contribute a
    // sensible step count to `SUM(steps)`.
    try {
      this.db.executeSync(
        `ALTER TABLE distance_entries ADD COLUMN steps INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
    // Keep the idempotent backfill outside the ALTER try/catch so an
    // interrupted migration is retried after the column already exists.
    const entryStrideFactor = AVERAGE_STRIDE_METERS * METERS_TO_MILES;
    this.db.executeSync(
      `UPDATE distance_entries
       SET steps = CAST(ROUND(miles / ${entryStrideFactor}) AS INTEGER)
       WHERE steps = 0 AND miles > 0`,
    );

    const reconciliationRows = this.db.executeSync(
      `SELECT id, date FROM distance_entries
       WHERE source = 'health-reconciliation'`,
    ).rows as Array<{ id: string; date: number }>;
    for (const row of reconciliationRows) {
      const dayEnd = reconciliationDayEndFromId(row.id);
      if (dayEnd !== null && row.date !== dayEnd) {
        this.db.executeSync(
          `UPDATE distance_entries SET date = ? WHERE id = ?`,
          [dayEnd, row.id],
        );
      }
    }

    // Progress snapshot table (single row per save id). Stores running
    // totals so hot-path reads (map screen, stats) don't have to
    // `SUM(distance_entries.*)` on every render. Kept in sync by every
    // writer in `progressStore`.
    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS progress_snapshot (
        id TEXT PRIMARY KEY,
        miles REAL NOT NULL DEFAULT 0,
        steps INTEGER NOT NULL DEFAULT 0,
        cache_version INTEGER NOT NULL DEFAULT ${CURRENT_PROGRESS_CACHE_VERSION},
        last_updated INTEGER NOT NULL DEFAULT 0
      )
    `);

    // A snapshot without a steps column is a miles-only legacy row.
    // Preserve its miles exactly and derive the equivalent steps once.
    try {
      this.db.executeSync(
        `ALTER TABLE progress_snapshot ADD COLUMN steps INTEGER NOT NULL DEFAULT 0`,
      );
      const strideFactor = AVERAGE_STRIDE_METERS * METERS_TO_MILES;
      this.db.executeSync(
        `UPDATE progress_snapshot
         SET steps = CAST(ROUND(miles / ${strideFactor}) AS INTEGER)
         WHERE steps = 0 AND miles > 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }

    // LIVE snapshots predate the authoritative-entry cache contract. A zero
    // version forces one rebuild from distance_entries on the first NEW load.
    try {
      this.db.executeSync(
        `ALTER TABLE progress_snapshot ADD COLUMN cache_version INTEGER NOT NULL DEFAULT 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  private async initializeDefaultSettings(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Use INSERT OR IGNORE to avoid UNIQUE constraint errors on race conditions
    this.db.executeSync(
      `INSERT OR IGNORE INTO user_settings (id, label_size, text_size, current_theme, show_checkpoint_labels, colorize_map, reduced_map_titles, dev_mode, use_miles, sync_enabled, sync_provider, sync_start_date, last_sync_timestamp, live_sync_enabled)
       VALUES (?, 'medium', 'medium', 'minimalist', 1, 1, 1, 0, 1, 0, 'none', NULL, NULL, 0)`,
      [DEFAULT_SAVE_ID],
    );
  }

  // User settings operations
  async getUserSettings(): Promise<UserSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.executeSync(
      'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
      [DEFAULT_SAVE_ID],
    );

    let row = result.rows?.[0];

    // If no settings found, create defaults
    if (!row) {
      this.db.executeSync(
        `INSERT OR REPLACE INTO user_settings (id, label_size, text_size, current_theme, show_checkpoint_labels, colorize_map, reduced_map_titles, dev_mode, use_miles, sync_enabled, sync_provider, sync_start_date, last_sync_timestamp, live_sync_enabled)
         VALUES (?, 'medium', 'medium', 'minimalist', 1, 1, 1, 0, 1, 0, 'none', NULL, NULL, 0)`,
        [DEFAULT_SAVE_ID],
      );

      const newResult = this.db.executeSync(
        'SELECT * FROM user_settings WHERE id = ? LIMIT 1',
        [DEFAULT_SAVE_ID],
      );
      row = newResult.rows?.[0];
    }

    if (!row) {
      throw new Error('Failed to create default settings');
    }

    return {
      id: row.id as string,
      labelSize: normalizeLabelSize(row.label_size),
      textSize: normalizeTextSize((row as any).text_size),
      currentTheme: row.current_theme as ThemeName,
      showPointLabels: row.show_checkpoint_labels === 1,
      colorizeMap: row.colorize_map === 1,
      reducedMapTitles: row.reduced_map_titles === 1,
      devMode:
        (row as any).dev_mode === 1 ||
        (row as any).dev_mode === true ||
        (row as any).dev_mode === '1',
      useMiles: (row as any).use_miles !== 0,
      syncEnabled: (row as any).sync_enabled === 1,
      syncProvider: ((row as any).sync_provider as SyncProvider) ?? 'none',
      syncStartDate: (row as any).sync_start_date ?? null,
      lastSyncTimestamp: (row as any).last_sync_timestamp ?? null,
      pedometerCursor: (row as any).pedometer_cursor
        ? JSON.parse((row as any).pedometer_cursor as string)
        : null,
      healthSyncFormatVersion:
        Number((row as any).health_sync_format_version) || 0,
      healthLookbackStartTimestamp:
        (row as any).health_lookback_start_timestamp ?? null,
      lastHealthReconciledThrough:
        (row as any).last_health_reconciled_through ?? null,
      liveSyncEnabled: (row as any).live_sync_enabled === 1,
      trackingMode:
        ((row as any).tracking_mode as TrackingMode) ?? 'health-app',
      hasSeenOemBatteryPrompt: (row as any).has_seen_oem_battery_prompt === 1,
      hcRevokePendingRestart: (row as any).hc_revoke_pending_restart === 1,
      pedometerCleanupPending: (row as any).pedometer_cleanup_pending === 1,
      lastNotifiedCheckpointIndex:
        typeof (row as any).last_notified_checkpoint_index === 'number'
          ? (row as any).last_notified_checkpoint_index
          : -1,
      sharingEnabled: (row as any).sharing_enabled === 1,
      sharingDisplayName: (row as any).sharing_display_name ?? null,
      sharingAffinity:
        ((row as any).sharing_affinity_selection as FriendAffinity) ?? null,
      sharingProvisioningPending:
        (row as any).sharing_provisioning_pending === 1,
      sharingDeletionPending: (row as any).sharing_deletion_pending === 1,
      sharingMigrationSourceUserId:
        (row as any).sharing_migration_source_user_id ?? null,
      lastPublishedMiles: (row as any).last_published_miles ?? null,
      lastSharedProgressSyncAt:
        (row as any).last_shared_progress_sync_at ?? null,
      lastJourneyBackupFileName:
        (row as any).last_journey_backup_file_name ?? null,
    };
  }

  async updateUserSettings(
    updates: Partial<Omit<UserSettings, 'id'>>,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.labelSize !== undefined) {
      fields.push('label_size = ?');
      values.push(updates.labelSize);
    }
    if (updates.textSize !== undefined) {
      fields.push('text_size = ?');
      values.push(updates.textSize);
    }
    if (updates.currentTheme !== undefined) {
      fields.push('current_theme = ?');
      values.push(updates.currentTheme);
    }
    if (updates.showPointLabels !== undefined) {
      fields.push('show_checkpoint_labels = ?');
      values.push(updates.showPointLabels ? 1 : 0);
    }
    if (updates.colorizeMap !== undefined) {
      fields.push('colorize_map = ?');
      values.push(updates.colorizeMap ? 1 : 0);
    }
    if (updates.reducedMapTitles !== undefined) {
      fields.push('reduced_map_titles = ?');
      values.push(updates.reducedMapTitles ? 1 : 0);
    }
    if (updates.devMode !== undefined) {
      fields.push('dev_mode = ?');
      values.push(updates.devMode ? 1 : 0);
    }
    if (updates.useMiles !== undefined) {
      fields.push('use_miles = ?');
      values.push(updates.useMiles ? 1 : 0);
    }
    if (updates.syncEnabled !== undefined) {
      fields.push('sync_enabled = ?');
      values.push(updates.syncEnabled ? 1 : 0);
    }
    if (updates.syncProvider !== undefined) {
      fields.push('sync_provider = ?');
      values.push(updates.syncProvider);
    }
    if (updates.syncStartDate !== undefined) {
      fields.push('sync_start_date = ?');
      values.push(updates.syncStartDate);
    }
    if (updates.lastSyncTimestamp !== undefined) {
      fields.push('last_sync_timestamp = ?');
      values.push(updates.lastSyncTimestamp);
    }
    if (updates.pedometerCursor !== undefined) {
      fields.push('pedometer_cursor = ?');
      values.push(
        updates.pedometerCursor === null
          ? null
          : JSON.stringify(updates.pedometerCursor),
      );
    }
    if (updates.healthSyncFormatVersion !== undefined) {
      fields.push('health_sync_format_version = ?');
      values.push(updates.healthSyncFormatVersion);
    }
    if (updates.healthLookbackStartTimestamp !== undefined) {
      fields.push('health_lookback_start_timestamp = ?');
      values.push(updates.healthLookbackStartTimestamp);
    }
    if (updates.lastHealthReconciledThrough !== undefined) {
      fields.push('last_health_reconciled_through = ?');
      values.push(updates.lastHealthReconciledThrough);
    }
    if (updates.liveSyncEnabled !== undefined) {
      fields.push('live_sync_enabled = ?');
      values.push(updates.liveSyncEnabled ? 1 : 0);
    }
    if (updates.trackingMode !== undefined) {
      fields.push('tracking_mode = ?');
      values.push(updates.trackingMode);
    }
    if (updates.hasSeenOemBatteryPrompt !== undefined) {
      fields.push('has_seen_oem_battery_prompt = ?');
      values.push(updates.hasSeenOemBatteryPrompt ? 1 : 0);
    }
    if (updates.hcRevokePendingRestart !== undefined) {
      fields.push('hc_revoke_pending_restart = ?');
      values.push(updates.hcRevokePendingRestart ? 1 : 0);
    }
    if (updates.pedometerCleanupPending !== undefined) {
      fields.push('pedometer_cleanup_pending = ?');
      values.push(updates.pedometerCleanupPending ? 1 : 0);
    }
    if (updates.lastNotifiedCheckpointIndex !== undefined) {
      fields.push('last_notified_checkpoint_index = ?');
      values.push(updates.lastNotifiedCheckpointIndex);
    }
    if (updates.sharingEnabled !== undefined) {
      fields.push('sharing_enabled = ?');
      values.push(updates.sharingEnabled ? 1 : 0);
    }
    if (updates.sharingDisplayName !== undefined) {
      fields.push('sharing_display_name = ?');
      values.push(updates.sharingDisplayName);
    }
    if (updates.sharingAffinity !== undefined) {
      fields.push('sharing_affinity_selection = ?');
      values.push(updates.sharingAffinity);
    }
    if (updates.sharingProvisioningPending !== undefined) {
      fields.push('sharing_provisioning_pending = ?');
      values.push(updates.sharingProvisioningPending ? 1 : 0);
    }
    if (updates.sharingDeletionPending !== undefined) {
      fields.push('sharing_deletion_pending = ?');
      values.push(updates.sharingDeletionPending ? 1 : 0);
    }
    if (updates.sharingMigrationSourceUserId !== undefined) {
      fields.push('sharing_migration_source_user_id = ?');
      values.push(updates.sharingMigrationSourceUserId);
    }
    if (updates.lastPublishedMiles !== undefined) {
      fields.push('last_published_miles = ?');
      values.push(updates.lastPublishedMiles);
    }
    if (updates.lastSharedProgressSyncAt !== undefined) {
      fields.push('last_shared_progress_sync_at = ?');
      values.push(updates.lastSharedProgressSyncAt);
    }
    if (updates.lastJourneyBackupFileName !== undefined) {
      fields.push('last_journey_backup_file_name = ?');
      values.push(updates.lastJourneyBackupFileName);
    }

    if (fields.length === 0) return;

    this.db.executeSync(
      `UPDATE user_settings SET ${fields.join(', ')} WHERE id = ?`,
      [...values, DEFAULT_SAVE_ID],
    );
  }

  async close(): Promise<void> {
    await this.writeQueue;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Distance entry operations
  async addDistanceEntry(entry: {
    id: string;
    saveId: string;
    date: number;
    miles: number;
    steps: number;
    source?: DistanceSource;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.executeSync(
      `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.saveId,
        entry.date,
        entry.miles,
        entry.steps,
        entry.source || 'manual',
      ],
    );
  }

  /**
   * Bulk insert distance entries inside a single transaction.
   * Massively faster than N individual addDistanceEntry calls when ingesting
   * a chunk of health records (hundreds of samples per day on Android).
   */
  async addDistanceEntriesBulk(
    entries: Array<{
      id: string;
      saveId: string;
      date: number;
      miles: number;
      steps: number;
      source?: DistanceSource;
    }>,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (entries.length === 0) return;
    this.db.executeSync('BEGIN TRANSACTION');
    try {
      for (const entry of entries) {
        this.db.executeSync(
          `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            entry.id,
            entry.saveId,
            entry.date,
            entry.miles,
            entry.steps,
            entry.source || 'manual',
          ],
        );
      }
      this.db.executeSync('COMMIT');
    } catch (e) {
      this.db.executeSync('ROLLBACK');
      throw e;
    }
  }

  async getDistanceEntriesByIds(
    saveId: string,
    ids: string[],
  ): Promise<DistanceEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, steps, source
       FROM distance_entries
       WHERE save_id = ? AND id IN (${placeholders})`,
      [saveId, ...ids],
    );
    return this.mapDistanceEntryRows(result.rows ?? []);
  }

  async getDistanceEntriesBetween(
    saveId: string,
    startInclusive: number,
    endExclusive: number,
  ): Promise<DistanceEntry[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, steps, source
       FROM distance_entries
       WHERE save_id = ? AND date >= ? AND date < ?
       ORDER BY date ASC, id ASC`,
      [saveId, startInclusive, endExclusive],
    );
    return this.mapDistanceEntryRows(result.rows ?? []);
  }

  async getDistanceEntryPage(
    saveId: string,
    cursor: { date: number; id: string } | null,
    limit: number,
  ): Promise<DistanceEntryPage> {
    if (!this.db) throw new Error('Database not initialized');
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const result = cursor
      ? this.db.executeSync(
          `SELECT id, save_id as saveId, date, miles, steps, source
           FROM distance_entries
           WHERE save_id = ? AND (date < ? OR (date = ? AND id < ?))
           ORDER BY date DESC, id DESC LIMIT ?`,
          [saveId, cursor.date, cursor.date, cursor.id, boundedLimit + 1],
        )
      : this.db.executeSync(
          `SELECT id, save_id as saveId, date, miles, steps, source
           FROM distance_entries
           WHERE save_id = ?
           ORDER BY date DESC, id DESC LIMIT ?`,
          [saveId, boundedLimit + 1],
        );
    const rows = this.mapDistanceEntryRows(result.rows ?? []);
    const hasMore = rows.length > boundedLimit;
    const entries = rows.slice(0, boundedLimit);
    const last = entries[entries.length - 1];
    return {
      entries,
      nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
    };
  }

  async getDistanceSourcePresence(saveId: string): Promise<DistanceSource[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT DISTINCT source FROM distance_entries WHERE save_id = ?`,
      [saveId],
    );
    return (result.rows ?? []).map(
      row => String((row as any).source || 'manual') as DistanceSource,
    );
  }

  async getDistanceDaySummaries(saveId: string): Promise<DistanceDaySummary[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT MIN(date) AS date, SUM(miles) AS miles, SUM(steps) AS steps
       FROM distance_entries
       WHERE save_id = ?
       GROUP BY strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime')
       ORDER BY date ASC`,
      [saveId],
    );
    return (result.rows ?? []).map(row => ({
      date: Number((row as any).date),
      miles: Number((row as any).miles),
      steps: Number((row as any).steps ?? 0),
    }));
  }

  async exportJourneyBackup(
    sharingUserId: string | null,
  ): Promise<JourneyBackup> {
    if (!this.db) throw new Error('Database not initialized');
    const settings = await this.getUserSettings();
    const entriesResult = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, steps, source
       FROM distance_entries
       WHERE save_id = ?
       ORDER BY date ASC, id ASC`,
      [DEFAULT_SAVE_ID],
    );
    const issueRows = this.db.executeSync(
      `SELECT slot, error, at, dismissed_at, resolved_at
       FROM troubleshooting_issues
       ORDER BY at ASC`,
    ).rows as Array<{
      slot: string;
      error: string;
      at: number;
      dismissed_at: number | null;
      resolved_at: number | null;
    }>;

    if (settings.sharingEnabled && !sharingUserId) {
      throw new Error('Could not read the active friend-sharing identity');
    }

    return {
      app: 'MiddleEarthChallenge',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      settings: {
        labelSize: settings.labelSize,
        textSize: settings.textSize,
        currentTheme: settings.currentTheme,
        showPointLabels: settings.showPointLabels,
        colorizeMap: settings.colorizeMap,
        reducedMapTitles: settings.reducedMapTitles,
        devMode: settings.devMode,
        useMiles: settings.useMiles,
        lastNotifiedCheckpointIndex: settings.lastNotifiedCheckpointIndex,
      },
      distanceEntries: this.mapDistanceEntryRows(entriesResult.rows ?? []),
      troubleshootingIssues: issueRows.flatMap(row => {
        try {
          return [
            {
              slot: String(row.slot),
              error: JSON.parse(row.error),
              at: Number(row.at),
              dismissedAt:
                row.dismissed_at == null ? null : Number(row.dismissed_at),
              resolvedAt:
                row.resolved_at == null ? null : Number(row.resolved_at),
            },
          ];
        } catch {
          return [];
        }
      }),
      sharing: {
        enabled: settings.sharingEnabled,
        userId: settings.sharingEnabled ? sharingUserId : null,
        displayName: settings.sharingEnabled
          ? settings.sharingDisplayName
          : null,
        affinity: settings.sharingEnabled ? settings.sharingAffinity : null,
      },
    };
  }

  async importJourneyBackup(backup: JourneyBackup): Promise<{
    miles: number;
    steps: number;
  }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

        this.db.executeSync(`DELETE FROM distance_entries WHERE save_id = ?`, [
          DEFAULT_SAVE_ID,
        ]);
        for (const entry of backup.distanceEntries) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              DEFAULT_SAVE_ID,
              entry.date,
              entry.miles,
              entry.steps,
              entry.source,
            ],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET label_size = ?,
               text_size = ?,
               current_theme = ?,
               show_checkpoint_labels = ?,
               colorize_map = ?,
               reduced_map_titles = ?,
               dev_mode = ?,
               use_miles = ?,
               last_notified_checkpoint_index = ?
           WHERE id = ?`,
          [
            backup.settings.labelSize,
            backup.settings.textSize,
            backup.settings.currentTheme,
            backup.settings.showPointLabels ? 1 : 0,
            backup.settings.colorizeMap ? 1 : 0,
            backup.settings.reducedMapTitles ? 1 : 0,
            backup.settings.devMode ? 1 : 0,
            backup.settings.useMiles ? 1 : 0,
            backup.settings.lastNotifiedCheckpointIndex,
            DEFAULT_SAVE_ID,
          ],
        );

        if (backup.sharing?.enabled) {
          this.db.executeSync(
            `UPDATE user_settings
             SET sharing_display_name = CASE
                   WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1
                     THEN sharing_display_name
                   ELSE ?
                 END,
                 sharing_affinity_selection = CASE
                   WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1
                     THEN sharing_affinity_selection
                   ELSE ?
                 END,
                 sharing_provisioning_pending = CASE
                   WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1
                     THEN sharing_provisioning_pending
                   ELSE 1
                 END,
                 sharing_migration_source_user_id = ?,
                 last_published_miles = CASE
                   WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1
                     THEN last_published_miles
                   ELSE NULL
                 END,
                 last_shared_progress_sync_at = CASE
                   WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1
                     THEN last_shared_progress_sync_at
                   ELSE NULL
                 END
             WHERE id = ?`,
            [
              backup.sharing.displayName,
              backup.sharing.affinity,
              backup.sharing.userId,
              DEFAULT_SAVE_ID,
            ],
          );
        }

        this.db.executeSync(`DELETE FROM troubleshooting_issues`);
        for (const issue of backup.troubleshootingIssues) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO troubleshooting_issues (slot, error, at, dismissed_at, resolved_at) VALUES (?, ?, ?, ?, ?)`,
            [
              issue.slot,
              JSON.stringify(issue.error),
              issue.at,
              issue.dismissedAt,
              issue.resolvedAt,
            ],
          );
        }

        return this.recalculateProgress(DEFAULT_SAVE_ID);
      }),
    );
  }

  async removeDistanceEntry(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.executeSync(`DELETE FROM distance_entries WHERE id = ?`, [id]);
  }

  async clearDistanceEntries(saveId?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (saveId) {
      this.db.executeSync(`DELETE FROM distance_entries WHERE save_id = ?`, [
        saveId,
      ]);
    } else {
      this.db.executeSync(`DELETE FROM distance_entries`);
    }
  }

  /**
   * Bulk-delete distance entries whose `source` matches any value in
   * `sources`. Executed as a single parameterised SQL statement so a
   * "delete synced data" or "delete manual data" tap doesn't block the
   * JS thread with N round-trips per entry.
   */
  async clearDistanceEntriesBySource(
    saveId: string,
    sources: DistanceSource[],
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (sources.length === 0) return;
    const placeholders = sources.map(() => '?').join(', ');
    this.db.executeSync(
      `DELETE FROM distance_entries WHERE save_id = ? AND source IN (${placeholders})`,
      [saveId, ...sources],
    );
  }

  async setProgressSnapshot(
    id: string,
    miles: number,
    steps: number,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const ts = Date.now();
    this.db.executeSync(
      `INSERT INTO progress_snapshot
       (id, miles, steps, cache_version, last_updated)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         miles = excluded.miles,
         steps = excluded.steps,
         cache_version = excluded.cache_version,
         last_updated = excluded.last_updated`,
      [
        id,
        miles,
        Math.max(0, Math.round(steps)),
        CURRENT_PROGRESS_CACHE_VERSION,
        ts,
      ],
    );
  }

  /**
   * Tracking issues survive process death because several faults cannot
   * re-announce themselves — the native sample-persistence flag resets with
   * the process, and a source fallback fires only once at switch time.
   * Without this, closing the app erases the evidence without fixing it.
   */
  async loadTroubleshootingIssues(): Promise<
    Array<{
      error: unknown;
      at: number;
      dismissedAt: number | null;
      resolvedAt: number | null;
    }>
  > {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT error, at, dismissed_at, resolved_at FROM troubleshooting_issues ORDER BY at ASC`,
    );
    const rows = result.rows ?? [];
    const issues = [];
    for (const row of rows as any[]) {
      try {
        issues.push({
          error: JSON.parse(row.error),
          at: Number(row.at),
          dismissedAt:
            row.dismissed_at == null ? null : Number(row.dismissed_at),
          resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at),
        });
      } catch {
        // A row we can't parse is a row we can't act on; skip rather than
        // failing hydration for the whole app.
      }
    }
    return issues;
  }

  async saveTroubleshootingIssues(
    issues: Array<{
      slot: string;
      error: unknown;
      at: number;
      dismissedAt: number | null;
      resolvedAt: number | null;
    }>,
  ): Promise<void> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        this.db.executeSync(`DELETE FROM troubleshooting_issues`);
        for (const issue of issues) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO troubleshooting_issues (slot, error, at, dismissed_at, resolved_at) VALUES (?, ?, ?, ?, ?)`,
            [
              issue.slot,
              JSON.stringify(issue.error),
              issue.at,
              issue.dismissedAt,
              issue.resolvedAt,
            ],
          );
        }
      }),
    );
  }

  async getProgressSnapshot(
    id: string,
  ): Promise<{ miles: number; steps: number } | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT miles, steps FROM progress_snapshot WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = result.rows?.[0];
    if (!row) return null;
    const miles = Number((row as any).miles);
    const steps = Number((row as any).steps);
    if (!Number.isFinite(miles)) return null;
    return {
      miles,
      steps: Number.isFinite(steps) ? steps : 0,
    };
  }

  async reconcileProgress(id: string): Promise<{
    miles: number;
    steps: number;
  }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => this.recalculateProgress(id)),
    );
  }

  async hydrateProgress(id: string): Promise<{
    miles: number;
    steps: number;
    entries: DistanceEntry[];
  }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

        const snapshotResult = this.db.executeSync(
          `SELECT miles, steps, cache_version
           FROM progress_snapshot WHERE id = ? LIMIT 1`,
          [id],
        );
        const snapshot = snapshotResult.rows?.[0] as any;
        const miles = Number(snapshot?.miles);
        const steps = Number(snapshot?.steps);
        if (
          snapshot?.cache_version === CURRENT_PROGRESS_CACHE_VERSION &&
          Number.isFinite(miles) &&
          Number.isFinite(steps)
        ) {
          return {
            miles,
            steps: Math.max(0, Math.round(steps)),
            entries: [],
          };
        }

        return {
          ...this.recalculateProgress(id),
          entries: [],
        };
      }),
    );
  }

  async applyDistanceEntryChanges(
    id: string,
    changes: DistanceEntryChanges,
  ): Promise<ProgressMutation> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        const progress = this.calculateProgressAfterChanges(id, changes);

        if (changes.clearAll) {
          this.db.executeSync(
            `DELETE FROM distance_entries WHERE save_id = ?`,
            [id],
          );
        }

        if (changes.removeIds && changes.removeIds.length > 0) {
          const placeholders = changes.removeIds.map(() => '?').join(', ');
          this.db.executeSync(
            `DELETE FROM distance_entries WHERE save_id = ? AND id IN (${placeholders})`,
            [id, ...changes.removeIds],
          );
        }

        if (changes.removeSources && changes.removeSources.length > 0) {
          const placeholders = changes.removeSources.map(() => '?').join(', ');
          this.db.executeSync(
            `DELETE FROM distance_entries WHERE save_id = ? AND source IN (${placeholders})`,
            [id, ...changes.removeSources],
          );
        }

        for (const entry of changes.upsert ?? []) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.saveId || id,
              entry.date,
              entry.miles,
              entry.steps,
              entry.source || 'manual',
            ],
          );
        }

        this.writeProgressSnapshot(id, progress.miles, progress.steps);
        return { ...progress, changes };
      }),
    );
  }

  async resetDistanceData(
    id: string,
    changes: { removeSources?: DistanceSource[]; clearAll?: boolean },
    resetAt: number,
    reconciliationBoundary: number,
  ): Promise<ProgressMutation> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        const progress = this.calculateProgressAfterChanges(id, changes);

        if (changes.clearAll) {
          this.db.executeSync(
            'DELETE FROM distance_entries WHERE save_id = ?',
            [id],
          );
        } else if (changes.removeSources && changes.removeSources.length > 0) {
          const placeholders = changes.removeSources.map(() => '?').join(', ');
          this.db.executeSync(
            `DELETE FROM distance_entries
             WHERE save_id = ? AND source IN (${placeholders})`,
            [id, ...changes.removeSources],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET sync_start_date = ?, last_sync_timestamp = NULL,
               pedometer_cursor = NULL,
               health_lookback_start_timestamp = ?,
               last_health_reconciled_through = ?
           WHERE id = ?`,
          [resetAt, resetAt, reconciliationBoundary, DEFAULT_SAVE_ID],
        );

        this.writeProgressSnapshot(id, progress.miles, progress.steps);
        return { ...progress, changes };
      }),
    );
  }

  async applyHealthSyncChunk(
    id: string,
    entries: DistanceEntry[],
    cursor: number,
    healthSyncFormatVersion: number,
    healthLookbackStartTimestamp: number | null,
  ): Promise<AppliedProgressMutation> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        const ownership = this.db.executeSync(
          `SELECT tracking_mode, sync_enabled, sync_provider
           FROM user_settings WHERE id = ?`,
          [DEFAULT_SAVE_ID],
        ).rows?.[0] as
          | {
              tracking_mode?: string;
              sync_enabled?: number;
              sync_provider?: string;
            }
          | undefined;
        if (
          ownership &&
          (ownership.tracking_mode !== 'health-app' ||
            ownership.sync_enabled !== 1 ||
            ownership.sync_provider === 'none')
        ) {
          return { applied: false };
        }
        if (this.isSyncCursorStale(cursor)) {
          return { applied: false };
        }
        const changes = { upsert: entries };
        const progress = this.calculateProgressAfterChanges(id, changes);

        for (const entry of entries) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.saveId || id,
              entry.date,
              entry.miles,
              entry.steps,
              entry.source,
            ],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET last_sync_timestamp = ?, health_sync_format_version = ?,
               health_lookback_start_timestamp = ?
           WHERE id = ?`,
          [
            cursor,
            healthSyncFormatVersion,
            healthLookbackStartTimestamp,
            DEFAULT_SAVE_ID,
          ],
        );

        this.writeProgressSnapshot(id, progress.miles, progress.steps);
        return { ...progress, changes, applied: true };
      }),
    );
  }

  async applyPedometerSyncChunk(
    id: string,
    entries: DistanceEntry[],
    cursor: number,
    expectedPedometerCursor?: import('../types').PedometerCursor | null,
    nextPedometerCursor?: import('../types').PedometerCursor | null,
  ): Promise<AppliedProgressMutation> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        const storedCursorResult = this.db.executeSync(
          `SELECT pedometer_cursor as pedometerCursor
           FROM user_settings WHERE id = ? LIMIT 1`,
          [DEFAULT_SAVE_ID],
        );
        const storedCursor =
          (storedCursorResult.rows?.[0] as any)?.pedometerCursor ?? null;
        const expectedCursorJson = expectedPedometerCursor
          ? JSON.stringify(expectedPedometerCursor)
          : null;
        if (
          storedCursor !== expectedCursorJson ||
          (expectedPedometerCursor == null && this.isSyncCursorStale(cursor))
        ) {
          return { applied: false };
        }
        const changes = { upsert: entries };
        const progress = this.calculateProgressAfterChanges(id, changes);

        for (const entry of entries) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.saveId || id,
              entry.date,
              entry.miles,
              entry.steps,
              entry.source,
            ],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET last_sync_timestamp = ?, pedometer_cursor = ? WHERE id = ?`,
          [
            cursor,
            nextPedometerCursor ? JSON.stringify(nextPedometerCursor) : null,
            DEFAULT_SAVE_ID,
          ],
        );

        this.writeProgressSnapshot(id, progress.miles, progress.steps);
        return { ...progress, changes, applied: true };
      }),
    );
  }

  async applyHealthReconciliationDay(
    id: string,
    changes: { upsert?: DistanceEntry[]; removeIds?: string[] },
    cursor: number,
  ): Promise<AppliedProgressMutation> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');
        if (this.isReconciliationCursorStale(cursor)) {
          return { applied: false };
        }
        const progress = this.calculateProgressAfterChanges(id, changes);

        if (changes.removeIds && changes.removeIds.length > 0) {
          const placeholders = changes.removeIds.map(() => '?').join(', ');
          this.db.executeSync(
            `DELETE FROM distance_entries WHERE save_id = ? AND id IN (${placeholders})`,
            [id, ...changes.removeIds],
          );
        }

        for (const entry of changes.upsert ?? []) {
          this.db.executeSync(
            `INSERT OR REPLACE INTO distance_entries (id, save_id, date, miles, steps, source) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.saveId || id,
              entry.date,
              entry.miles,
              entry.steps,
              entry.source,
            ],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET last_health_reconciled_through = ? WHERE id = ?`,
          [cursor, DEFAULT_SAVE_ID],
        );

        this.writeProgressSnapshot(id, progress.miles, progress.steps);
        return { ...progress, changes, applied: true };
      }),
    );
  }

  private isSyncCursorStale(cursor: number): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT sync_start_date as syncStartDate
       FROM user_settings WHERE id = ? LIMIT 1`,
      [DEFAULT_SAVE_ID],
    );
    const syncStartDate = Number((result.rows?.[0] as any)?.syncStartDate);
    return Number.isFinite(syncStartDate) && cursor <= syncStartDate;
  }

  private isReconciliationCursorStale(cursor: number): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT last_health_reconciled_through as lastHealthReconciledThrough
       FROM user_settings WHERE id = ? LIMIT 1`,
      [DEFAULT_SAVE_ID],
    );
    const boundary = Number(
      (result.rows?.[0] as any)?.lastHealthReconciledThrough,
    );
    return Number.isFinite(boundary) && cursor <= boundary;
  }

  private enqueueWrite<T>(operation: () => T): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private runTransaction<T>(operation: () => T): T {
    if (!this.db) throw new Error('Database not initialized');

    this.db.executeSync('BEGIN TRANSACTION');
    try {
      const result = operation();
      this.db.executeSync('COMMIT');
      return result;
    } catch (error) {
      this.db.executeSync('ROLLBACK');
      throw error;
    }
  }

  private recalculateProgress(id: string): {
    miles: number;
    steps: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const totalsResult = this.db.executeSync(
      `SELECT COALESCE(SUM(miles), 0) AS miles,
              COALESCE(SUM(steps), 0) AS steps
       FROM distance_entries WHERE save_id = ?`,
      [id],
    );
    const totalsRow = totalsResult.rows?.[0];
    const miles = Number((totalsRow as any)?.miles ?? 0);
    const steps = Math.max(
      0,
      Math.round(Number((totalsRow as any)?.steps ?? 0)),
    );

    this.writeProgressSnapshot(id, miles, steps);

    return { miles, steps };
  }

  private calculateProgressAfterChanges(
    id: string,
    changes: DistanceEntryChanges,
  ): { miles: number; steps: number } {
    if (!this.db) throw new Error('Database not initialized');

    const snapshotResult = this.db.executeSync(
      `SELECT miles, steps, cache_version
       FROM progress_snapshot WHERE id = ? LIMIT 1`,
      [id],
    );
    const snapshot = snapshotResult.rows?.[0] as any;
    let miles = Number(snapshot?.miles);
    let steps = Number(snapshot?.steps);
    if (
      snapshot?.cache_version !== CURRENT_PROGRESS_CACHE_VERSION ||
      !Number.isFinite(miles) ||
      !Number.isFinite(steps)
    ) {
      const repaired = this.recalculateProgress(id);
      miles = repaired.miles;
      steps = repaired.steps;
    }

    const upserts = changes.upsert ?? [];
    if (changes.clearAll) {
      miles = 0;
      steps = 0;
    }

    const affectedIds = new Set([
      ...(changes.removeIds ?? []),
      ...upserts.map(entry => entry.id),
    ]);
    const removeSources = new Set(changes.removeSources ?? []);
    const conditions: string[] = [];
    const params: string[] = [id];
    if (!changes.clearAll && affectedIds.size > 0) {
      conditions.push(`id IN (${[...affectedIds].map(() => '?').join(', ')})`);
      params.push(...affectedIds);
    }
    if (!changes.clearAll && removeSources.size > 0) {
      conditions.push(
        `source IN (${[...removeSources].map(() => '?').join(', ')})`,
      );
      params.push(...removeSources);
    }

    const affectedEntries = new Map<string, DistanceEntry>();
    if (conditions.length > 0) {
      const result = this.db.executeSync(
        `SELECT id, save_id as saveId, date, miles, steps, source
         FROM distance_entries
         WHERE save_id = ? AND (${conditions.join(' OR ')})`,
        params,
      );
      for (const row of result.rows ?? []) {
        affectedEntries.set(String((row as any).id), {
          id: String((row as any).id),
          saveId: String((row as any).saveId),
          date: Number((row as any).date),
          miles: Number((row as any).miles),
          steps: Number((row as any).steps ?? 0),
          source: ((row as any).source || 'manual') as DistanceSource,
        });
      }
    }

    const subtract = (entry: DistanceEntry) => {
      miles -= entry.miles;
      steps -= entry.steps;
      affectedEntries.delete(entry.id);
    };
    for (const removeId of changes.removeIds ?? []) {
      const existing = affectedEntries.get(removeId);
      if (existing) subtract(existing);
    }
    if (removeSources.size > 0) {
      for (const existing of [...affectedEntries.values()]) {
        if (removeSources.has(existing.source)) subtract(existing);
      }
    }
    for (const entry of upserts) {
      const existing = affectedEntries.get(entry.id);
      if (existing) subtract(existing);
      miles += entry.miles;
      steps += entry.steps;
      affectedEntries.set(entry.id, entry);
    }

    return {
      miles: Math.max(0, miles),
      steps: Math.max(0, Math.round(steps)),
    };
  }

  private writeProgressSnapshot(
    id: string,
    miles: number,
    steps: number,
  ): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.executeSync(
      `INSERT OR REPLACE INTO progress_snapshot
        (id, miles, steps, cache_version, last_updated)
        VALUES (?, ?, ?, ?, ?)`,
      [id, miles, steps, CURRENT_PROGRESS_CACHE_VERSION, Date.now()],
    );
  }

  private mapDistanceEntryRows(rows: readonly unknown[]): DistanceEntry[] {
    return rows.map((row: any) => ({
      id: String(row.id),
      saveId: String(row.saveId),
      date: Number(row.date),
      miles: Number(row.miles),
      steps: Number(row.steps ?? 0),
      source: (row.source || 'manual') as DistanceSource,
    }));
  }
}

export const database = new Database();
