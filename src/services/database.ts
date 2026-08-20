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

const CURRENT_PROGRESS_CACHE_VERSION = 1;
export const CURRENT_HEALTH_SYNC_FORMAT_VERSION = 1;

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

class Database {
  private db: DB | null = null;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.db) return;

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
  }

  private async initialize(): Promise<void> {
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
        last_published_miles REAL,
        last_shared_progress_sync_at INTEGER
      )
    `);

    // Migration: add text_size column for installs that pre-date it.
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
      `ALTER TABLE user_settings ADD COLUMN last_published_miles REAL`,
      `ALTER TABLE user_settings ADD COLUMN last_shared_progress_sync_at INTEGER`,
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

    // Add `steps` column to existing installs. Backfills from `miles`
    // using the stride constants so legacy rows still contribute a
    // sensible step count to `SUM(steps)`.
    try {
      this.db.executeSync(
        `ALTER TABLE distance_entries ADD COLUMN steps INTEGER NOT NULL DEFAULT 0`,
      );
      // Backfill any rows that just got the default 0 — round miles back
      // through the stride equation. Constants imported from
      // src/utils/stride.ts so they can never drift out of sync with
      // the runtime stepsToMiles / milesToSteps helpers.
      const strideFactor = AVERAGE_STRIDE_METERS * METERS_TO_MILES;
      this.db.executeSync(
        `UPDATE distance_entries
         SET steps = CAST(ROUND(miles / ${strideFactor}) AS INTEGER)
         WHERE steps = 0 AND miles > 0`,
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
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
      lastPublishedMiles: (row as any).last_published_miles ?? null,
      lastSharedProgressSyncAt:
        (row as any).last_shared_progress_sync_at ?? null,
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
    if (updates.lastPublishedMiles !== undefined) {
      fields.push('last_published_miles = ?');
      values.push(updates.lastPublishedMiles);
    }
    if (updates.lastSharedProgressSyncAt !== undefined) {
      fields.push('last_shared_progress_sync_at = ?');
      values.push(updates.lastSharedProgressSyncAt);
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

  async getDistanceEntries(saveId: string): Promise<
    {
      id: string;
      saveId: string;
      date: number;
      miles: number;
      steps: number;
      source: DistanceSource;
    }[]
  > {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, steps, source FROM distance_entries WHERE save_id = ? ORDER BY date ASC`,
      [saveId],
    );
    const rows = result.rows || [];
    return rows.map((r: any) => ({
      id: String(r.id),
      saveId: String(r.saveId),
      date: Number(r.date),
      miles: Number(r.miles),
      steps: Number(r.steps ?? 0),
      source: (r.source || 'manual') as DistanceSource,
    }));
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
    entries: DistanceEntry[];
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
            entries: this.readDistanceEntries(id),
          };
        }

        return this.recalculateProgress(id);
      }),
    );
  }

  async applyDistanceEntryChanges(
    id: string,
    changes: {
      upsert?: DistanceEntry[];
      removeIds?: string[];
      removeSources?: DistanceSource[];
      clearAll?: boolean;
    },
  ): Promise<{ miles: number; steps: number; entries: DistanceEntry[] }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

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

        return this.recalculateProgress(id);
      }),
    );
  }

  async applyHealthSyncChunk(
    id: string,
    entries: DistanceEntry[],
    cursor: number,
    healthSyncFormatVersion: number,
    healthLookbackStartTimestamp: number | null,
  ): Promise<{ miles: number; steps: number; entries: DistanceEntry[] }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

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

        return this.recalculateProgress(id);
      }),
    );
  }

  async applyPedometerSyncChunk(
    id: string,
    entries: DistanceEntry[],
    cursor: number,
  ): Promise<{ miles: number; steps: number; entries: DistanceEntry[] }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

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
          `UPDATE user_settings SET last_sync_timestamp = ? WHERE id = ?`,
          [cursor, DEFAULT_SAVE_ID],
        );

        return this.recalculateProgress(id);
      }),
    );
  }

  async applyHealthReconciliationDay(
    id: string,
    changes: { upsert?: DistanceEntry[]; removeIds?: string[] },
    cursor: number,
  ): Promise<{ miles: number; steps: number; entries: DistanceEntry[] }> {
    return this.enqueueWrite(() =>
      this.runTransaction(() => {
        if (!this.db) throw new Error('Database not initialized');

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

        if (changes.removeIds && changes.removeIds.length > 0) {
          const placeholders = changes.removeIds.map(() => '?').join(', ');
          this.db.executeSync(
            `DELETE FROM distance_entries WHERE save_id = ? AND id IN (${placeholders})`,
            [id, ...changes.removeIds],
          );
        }

        this.db.executeSync(
          `UPDATE user_settings
           SET last_health_reconciled_through = ? WHERE id = ?`,
          [cursor, DEFAULT_SAVE_ID],
        );

        return this.recalculateProgress(id);
      }),
    );
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
    entries: DistanceEntry[];
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

    this.db.executeSync(
      `INSERT OR REPLACE INTO progress_snapshot
        (id, miles, steps, cache_version, last_updated)
        VALUES (?, ?, ?, ?, ?)`,
      [id, miles, steps, CURRENT_PROGRESS_CACHE_VERSION, Date.now()],
    );

    return { miles, steps, entries: this.readDistanceEntries(id) };
  }

  private readDistanceEntries(id: string): DistanceEntry[] {
    if (!this.db) throw new Error('Database not initialized');

    const entriesResult = this.db.executeSync(
      `SELECT id, save_id as saveId, date, miles, steps, source
       FROM distance_entries WHERE save_id = ? ORDER BY date ASC`,
      [id],
    );
    const entries = (entriesResult.rows ?? []).map((row: any) => ({
      id: String(row.id),
      saveId: String(row.saveId),
      date: Number(row.date),
      miles: Number(row.miles),
      steps: Number(row.steps ?? 0),
      source: (row.source || 'manual') as DistanceSource,
    }));

    return entries;
  }
}

export const database = new Database();
