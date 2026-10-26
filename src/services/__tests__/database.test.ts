import { open } from '@op-engineering/op-sqlite';

import {
  database,
  CURRENT_SCHEMA_VERSION,
  PRE_MIGRATION_SNAPSHOT_DB_NAME,
  needsPreMigrationSnapshot,
  isLegacyUpgradeMissingSchemaMeta,
} from '../database';
import { useProgressStore } from '../../stores/progressStore';
import { createTransactionalProgressDb } from '../__testHelpers__/transactionalProgressDb';

const mockOpen = open as jest.MockedFunction<typeof open>;

function createMockDatabase() {
  return {
    executeSync: jest.fn(
      (
        _sql: string,
        _params?: unknown[],
      ): { rows: Record<string, unknown>[] } => ({ rows: [] }),
    ),
    close: jest.fn(),
  };
}

// Distinct from createMockDatabase(): also exposes getDbPath/delete, which
// only the pre-migration snapshot handle needs (a second, short-lived
// database opened purely to read/clear the snapshot file's own path).
function createMockSnapshotHandle(path = '/mock/premigration.db') {
  return {
    executeSync: jest.fn(() => ({ rows: [] })),
    close: jest.fn(),
    getDbPath: jest.fn(() => path),
    delete: jest.fn(),
  };
}

describe('database initialization', () => {
  beforeEach(async () => {
    await database.close();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await database.close();
  });

  it('opens only one handle for concurrent initialization calls', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);

    await Promise.all([database.init(), database.init()]);

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockDb.close).not.toHaveBeenCalled();
  });

  it('defaults fresh installs to format 1 and upgraded rows to format 0', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);

    await database.init();

    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining(
        'health_sync_format_version INTEGER NOT NULL DEFAULT 1',
      ),
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      'ALTER TABLE user_settings ADD COLUMN health_sync_format_version INTEGER NOT NULL DEFAULT 0',
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining(
        'pedometer_cleanup_pending INTEGER NOT NULL DEFAULT 0',
      ),
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      'ALTER TABLE user_settings ADD COLUMN pedometer_cleanup_pending INTEGER NOT NULL DEFAULT 0',
    );
  });

  it('indexes history reads by save and date', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);

    await database.init();

    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE INDEX IF NOT EXISTS idx_distance_entries_save_date',
      ),
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('ON distance_entries (save_id, date)'),
    );
  });

  it('moves existing health adjustments to the end of their local day', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes("WHERE source = 'health-reconciliation'")) {
        return {
          rows: [
            {
              id: 'health_reconciliation_2026-08-16',
              date: new Date(2026, 7, 16, 12).getTime(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);

    await database.init();

    expect(mockDb.executeSync).toHaveBeenCalledWith(
      'UPDATE distance_entries SET date = ? WHERE id = ?',
      [new Date(2026, 7, 17).getTime() - 1, 'health_reconciliation_2026-08-16'],
    );
  });

  it('closes a partial handle and permits retry after initialization fails', async () => {
    const failedDb = createMockDatabase();
    failedDb.executeSync.mockImplementationOnce(() => {
      throw new Error('schema unavailable');
    });
    const retryDb = createMockDatabase();
    mockOpen
      .mockReturnValueOnce(failedDb as never)
      .mockReturnValueOnce(retryDb as never);

    await expect(database.init()).rejects.toThrow('schema unavailable');
    // false = not a protected upgrade — this mock's default `rows: []`
    // means neither schema_meta nor distance_entries existed beforehand,
    // i.e. a genuine fresh install, which correctly needs no protection.
    await expect(database.init()).resolves.toBe(false);

    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(failedDb.close).toHaveBeenCalledTimes(1);
    expect(retryDb.close).not.toHaveBeenCalled();
  });

  describe('needsPreMigrationSnapshot', () => {
    it.each([
      [0, 1, false],
      [1, 1, false],
      [1, 2, true],
      [2, 2, false],
      [3, 2, false],
      [0, 5, false],
    ])('stored=%i, current=%i -> %p', (stored, current, expected) => {
      expect(needsPreMigrationSnapshot(stored, current)).toBe(expected);
    });
  });

  describe('isLegacyUpgradeMissingSchemaMeta', () => {
    it.each([
      // [schemaMetaTableExisted, distanceEntriesTableExisted, expected]
      [false, false, false], // genuine fresh install — neither table yet
      [false, true, true], // real legacy upgrade: has data, never tracked schema
      [true, true, false], // already-tracked install, any later version
      [true, false, false], // tracked but somehow no entries table (shouldn't
      // happen in practice, but schema_meta already existing means this
      // was already running schema-tracked code, not a legacy first-touch)
    ])(
      'schemaMetaExisted=%p, distanceEntriesExisted=%p -> %p',
      (schemaMetaExisted, distanceEntriesExisted, expected) => {
        expect(
          isLegacyUpgradeMissingSchemaMeta(
            schemaMetaExisted,
            distanceEntriesExisted,
          ),
        ).toBe(expected);
      },
    );
  });

  describe('pre-migration snapshot and restore', () => {
    it('does not snapshot a fresh install with no recorded schema version', async () => {
      const mockDb = createMockDatabase();
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('SELECT version FROM schema_meta')) {
          return { rows: [{ version: 0 }] };
        }
        return { rows: [] };
      });
      mockOpen.mockReturnValue(mockDb as never);

      await database.init();

      expect(mockOpen).toHaveBeenCalledTimes(1);
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('VACUUM INTO'),
        ),
      ).toBe(false);
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        `UPDATE schema_meta SET version = ? WHERE id = 1`,
        [CURRENT_SCHEMA_VERSION],
      );
    });

    it('does not snapshot an install already at the current schema version', async () => {
      const mockDb = createMockDatabase();
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('SELECT version FROM schema_meta')) {
          return { rows: [{ version: CURRENT_SCHEMA_VERSION }] };
        }
        return { rows: [] };
      });
      mockOpen.mockReturnValue(mockDb as never);

      await database.init();

      expect(mockOpen).toHaveBeenCalledTimes(1);
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('VACUUM INTO'),
        ),
      ).toBe(false);
    });

    // Regression: a real legacy (pre-1.1.3-tracking) database migrating to
    // a schema-tracked version for the very first time has `distance_entries`
    // already populated with a real user's irreplaceable history, but has
    // never had a `schema_meta` table at all — so the version-compare check
    // alone reads `storedSchemaVersion === 0` exactly as it would for a
    // genuine fresh install, and previously skipped the protective snapshot
    // on exactly the one upgrade that most needed it. Confirmed missing
    // on-device against a real legacy-shaped fixture database before this
    // fix: no `MiddleEarthSettings.premigration.db` snapshot file was ever
    // created during that upgrade.
    it('snapshots a legacy pre-schema_meta install that already has distance entries', async () => {
      const mockDb = createMockDatabase();
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (
          sql.includes('sqlite_master') &&
          sql.includes("name IN ('schema_meta', 'distance_entries')")
        ) {
          // schema_meta does not exist yet; distance_entries already does —
          // exactly the real legacy-database shape.
          return { rows: [{ name: 'distance_entries' }] };
        }
        if (sql.includes('SELECT version FROM schema_meta')) {
          return { rows: [{ version: 0 }] };
        }
        return { rows: [] };
      });
      // First open() is the main database; createPreMigrationSnapshot()
      // opens a second short-lived handle on the snapshot file itself
      // (to read its path and clear any stale prior snapshot) — matching
      // the pattern the existing "creates a snapshot via VACUUM INTO" test
      // above uses.
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen
        .mockReturnValueOnce(mockDb as never)
        .mockReturnValueOnce(snapshotHandle as never);

      await database.init();

      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('VACUUM INTO'),
        ),
      ).toBe(true);
    });

    it('creates a snapshot via VACUUM INTO, clearing any stale prior snapshot first', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();

      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      (database as any).createPreMigrationSnapshot();

      expect(mockOpen).toHaveBeenCalledWith({
        name: PRE_MIGRATION_SNAPSHOT_DB_NAME,
      });
      expect(snapshotHandle.getDbPath).toHaveBeenCalledTimes(1);
      // Clearing the stale snapshot must happen before VACUUM INTO writes
      // the new one, since VACUUM INTO refuses to overwrite an existing file.
      expect(snapshotHandle.delete).toHaveBeenCalledTimes(1);
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        `VACUUM INTO '/mock/premigration.db'`,
      );
    });

    it('escapes single quotes in the snapshot path for VACUUM INTO', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();

      const snapshotHandle = createMockSnapshotHandle(
        "/mock/o'brien/premigration.db",
      );
      mockOpen.mockReturnValue(snapshotHandle as never);

      (database as any).createPreMigrationSnapshot();

      expect(mockDb.executeSync).toHaveBeenCalledWith(
        `VACUUM INTO '/mock/o''brien/premigration.db'`,
      );
    });

    it('restores every table from the snapshot by dropping, recreating, and copying rows', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();

      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type = 'table'")) {
          return {
            rows: [
              {
                name: 'user_settings',
                sql: 'CREATE TABLE user_settings (id TEXT PRIMARY KEY)',
              },
              {
                name: 'distance_entries',
                sql: 'CREATE TABLE distance_entries (id TEXT PRIMARY KEY)',
              },
            ],
          };
        }
        if (sql.includes('sqlite_master') && sql.includes("type = 'index'")) {
          return {
            rows: [
              {
                sql: 'CREATE INDEX idx_distance_entries_save_date ON distance_entries (save_id, date)',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      (database as any).restoreFromPreMigrationSnapshot();

      const calls = mockDb.executeSync.mock.calls.map(([sql]) => String(sql));
      expect(calls).toContain(
        `ATTACH DATABASE '/mock/premigration.db' AS pre_migration_snapshot`,
      );
      expect(calls).toContain('DROP TABLE IF EXISTS "user_settings"');
      expect(calls).toContain(
        'CREATE TABLE user_settings (id TEXT PRIMARY KEY)',
      );
      expect(calls).toContain(
        'INSERT INTO "user_settings" SELECT * FROM pre_migration_snapshot."user_settings"',
      );
      expect(calls).toContain('DROP TABLE IF EXISTS "distance_entries"');
      expect(calls).toContain(
        'INSERT INTO "distance_entries" SELECT * FROM pre_migration_snapshot."distance_entries"',
      );
      expect(calls).toContain(
        'CREATE INDEX idx_distance_entries_save_date ON distance_entries (save_id, date)',
      );
      expect(calls).toContain('DETACH DATABASE pre_migration_snapshot');
      // Detach must run even though it's the last statement, so a failure
      // partway through table restoration can't leave the snapshot attached.
      expect(calls.indexOf('DETACH DATABASE pre_migration_snapshot')).toBe(
        calls.length - 1,
      );
    });

    it('drops a live table that has no counterpart in the snapshot, but keeps schema_meta', async () => {
      // Regression test: a migration can fail after CREATE TABLE-ing a
      // brand-new table that didn't exist when the snapshot was taken (the
      // same "new table" pattern runSchemaMigrations() already uses via
      // CREATE TABLE IF NOT EXISTS). Restoring only tables the snapshot
      // knows about must not leave that orphaned, partially-migrated table
      // behind — otherwise the restore isn't an exact revert.
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();

      mockDb.executeSync.mockImplementation((sql: string) => {
        if (
          sql.includes('pre_migration_snapshot.sqlite_master') &&
          sql.includes("type = 'table'")
        ) {
          return {
            rows: [
              {
                name: 'user_settings',
                sql: 'CREATE TABLE user_settings (id TEXT PRIMARY KEY)',
              },
            ],
          };
        }
        // Unqualified sqlite_master (no alias prefix) is the LIVE
        // database's own table list — this must include a table the
        // snapshot never had, plus schema_meta.
        if (
          sql.startsWith('SELECT name FROM sqlite_master') &&
          sql.includes("type = 'table'")
        ) {
          return {
            rows: [
              { name: 'user_settings' },
              { name: 'schema_meta' },
              { name: 'a_new_table_added_by_the_failed_migration' },
            ],
          };
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      (database as any).restoreFromPreMigrationSnapshot();

      const calls = mockDb.executeSync.mock.calls.map(([sql]) => String(sql));
      expect(calls).toContain(
        'DROP TABLE IF EXISTS "a_new_table_added_by_the_failed_migration"',
      );
      expect(calls).not.toContain('DROP TABLE IF EXISTS "schema_meta"');
      // user_settings is in the snapshot, so it's handled by the normal
      // restore loop, not the orphan-cleanup pass — only one drop for it.
      expect(
        calls.filter(sql => sql === 'DROP TABLE IF EXISTS "user_settings"'),
      ).toHaveLength(1);
    });

    it('detaches the snapshot even when restoring a table fails', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();

      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type = 'table'")) {
          return {
            rows: [
              {
                name: 'user_settings',
                sql: 'CREATE TABLE user_settings (id TEXT PRIMARY KEY)',
              },
            ],
          };
        }
        if (sql.startsWith('DROP TABLE')) {
          throw new Error('disk error');
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      expect(() => (database as any).restoreFromPreMigrationSnapshot()).toThrow(
        'disk error',
      );

      const calls = mockDb.executeSync.mock.calls.map(([sql]) => String(sql));
      expect(calls).toContain('DETACH DATABASE pre_migration_snapshot');
      // The rebuild must run as one transaction: a mid-loop failure has to
      // roll back rather than leave some tables dropped/recreated and
      // others untouched, which would be worse than the original state.
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
      expect(calls.indexOf('ROLLBACK')).toBeLessThan(
        calls.indexOf('DETACH DATABASE pre_migration_snapshot'),
      );
    });

    it('wraps the table and index rebuild in a single transaction on success', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();

      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master') && sql.includes("type = 'table'")) {
          return {
            rows: [
              {
                name: 'user_settings',
                sql: 'CREATE TABLE user_settings (id TEXT PRIMARY KEY)',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      (database as any).restoreFromPreMigrationSnapshot();

      const calls = mockDb.executeSync.mock.calls.map(([sql]) => String(sql));
      const attachIndex = calls.indexOf(
        `ATTACH DATABASE '/mock/premigration.db' AS pre_migration_snapshot`,
      );
      const beginIndex = calls.indexOf('BEGIN TRANSACTION');
      const commitIndex = calls.indexOf('COMMIT');
      const detachIndex = calls.indexOf('DETACH DATABASE pre_migration_snapshot');

      // ATTACH/DETACH must sit outside the transaction — SQLite rejects
      // both when a transaction is already open.
      expect(attachIndex).toBeGreaterThanOrEqual(0);
      expect(beginIndex).toBeGreaterThan(attachIndex);
      expect(commitIndex).toBeGreaterThan(beginIndex);
      expect(detachIndex).toBeGreaterThan(commitIndex);
    });
  });

  describe('migrateWithSnapshotProtection', () => {
    it('runs migrations directly without snapshotting when not a protected upgrade', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();

      (database as any).migrateWithSnapshotProtection(false);

      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('VACUUM INTO'),
        ),
      ).toBe(false);
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).includes('CREATE TABLE IF NOT EXISTS user_settings'),
        ),
      ).toBe(true);
    });

    it('propagates a migration failure without restoring when not a protected upgrade', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS user_settings')) {
          throw new Error('migration failed');
        }
        return { rows: [] };
      });

      expect(() =>
        (database as any).migrateWithSnapshotProtection(false),
      ).toThrow('migration failed');
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('ATTACH DATABASE'),
        ),
      ).toBe(false);
    });

    it('snapshots, and on migration failure restores and retries once, succeeding on the retry', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();

      let attempt = 0;
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS user_settings')) {
          attempt += 1;
          if (attempt === 1) {
            throw new Error('migration failed');
          }
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      expect(() =>
        (database as any).migrateWithSnapshotProtection(true),
      ).not.toThrow();

      expect(attempt).toBe(2);
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('VACUUM INTO'),
        ),
      ).toBe(true);
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('ATTACH DATABASE'),
        ),
      ).toBe(true);
    });

    it('gives up and propagates the error when the retry after restore also fails', async () => {
      const mockDb = createMockDatabase();
      mockOpen.mockReturnValue(mockDb as never);
      await database.init();
      mockDb.executeSync.mockClear();

      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS user_settings')) {
          throw new Error('migration still failing');
        }
        return { rows: [] };
      });
      const snapshotHandle = createMockSnapshotHandle('/mock/premigration.db');
      mockOpen.mockReturnValue(snapshotHandle as never);

      expect(() =>
        (database as any).migrateWithSnapshotProtection(true),
      ).toThrow('migration still failing');
      expect(
        mockDb.executeSync.mock.calls.some(([sql]) =>
          String(sql).startsWith('ATTACH DATABASE'),
        ),
      ).toBe(true);
    });
  });

  it('retries the legacy steps backfill after the column was added', async () => {
    const failedDb = createMockDatabase();
    failedDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE distance_entries')) {
        throw new Error('backfill interrupted');
      }
      return { rows: [] };
    });
    const retryDb = createMockDatabase();
    retryDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('ALTER TABLE distance_entries ADD COLUMN steps')) {
        throw new Error('duplicate column name: steps');
      }
      return { rows: [] };
    });
    mockOpen
      .mockReturnValueOnce(failedDb as never)
      .mockReturnValueOnce(retryDb as never);

    await expect(database.init()).rejects.toThrow('backfill interrupted');
    // false = not a protected upgrade — same reasoning as the matching
    // assertion in "closes a partial handle and permits retry after
    // initialization fails" above.
    await expect(database.init()).resolves.toBe(false);

    expect(retryDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE distance_entries'),
    );
  });

  it('rebuilds a LIVE snapshot once, then reads the versioned cache', async () => {
    const mockDb = createMockDatabase();
    let cacheVersion = 0;
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT miles, steps, cache_version')) {
        return {
          rows: [{ miles: 8, steps: 12_000, cache_version: cacheVersion }],
        };
      }
      if (sql.includes('SELECT COALESCE(SUM(miles)')) {
        return { rows: [{ miles: 8, steps: 12_000 }] };
      }
      if (sql.includes('INSERT OR REPLACE INTO progress_snapshot')) {
        cacheVersion = 1;
      }
      if (sql.includes('SELECT id, save_id as saveId')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();

    await expect(database.hydrateProgress('default')).resolves.toMatchObject({
      miles: 8,
      steps: 12_000,
      entries: [],
    });
    await expect(database.hydrateProgress('default')).resolves.toMatchObject({
      miles: 8,
      steps: 12_000,
      entries: [],
    });

    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO progress_snapshot'),
      ['default', 8, 12_000, 1, expect.any(Number)],
    );
    expect(
      mockDb.executeSync.mock.calls.filter(([sql]) =>
        String(sql).includes('SELECT COALESCE(SUM(miles)'),
      ),
    ).toHaveLength(1);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('ORDER BY date ASC'),
      ),
    ).toBe(false);
  });

  it('pages history with a stable date and id cursor', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();
    mockDb.executeSync.mockReturnValue({
      rows: [
        {
          id: 'c',
          saveId: 'default',
          date: 30,
          miles: 3,
          steps: 6000,
          source: 'pedometer',
        },
        {
          id: 'b',
          saveId: 'default',
          date: 20,
          miles: 2,
          steps: 4000,
          source: 'manual-distance',
        },
        {
          id: 'a',
          saveId: 'default',
          date: 10,
          miles: 1,
          steps: 2000,
          source: 'manual-distance',
        },
      ],
    });

    await expect(
      database.getDistanceEntryPage('default', null, 2),
    ).resolves.toMatchObject({
      entries: [{ id: 'c' }, { id: 'b' }],
      nextCursor: { date: 20, id: 'b' },
    });
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY date DESC, id DESC LIMIT ?'),
      ['default', 3],
    );

    await database.getDistanceEntryPage('default', { date: 20, id: 'b' }, 2);
    expect(mockDb.executeSync).toHaveBeenLastCalledWith(
      expect.stringContaining('date < ? OR (date = ? AND id < ?)'),
      ['default', 20, 20, 'b', 3],
    );
  });

  it('loads statistics as database-aggregated daily rows', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();
    mockDb.executeSync.mockReturnValue({
      rows: [{ date: 10, miles: 4.5, steps: 9000 }],
    });

    await expect(database.getDistanceDaySummaries('default')).resolves.toEqual([
      { date: 10, miles: 4.5, steps: 9000 },
    ]);
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY strftime('%Y-%m-%d'"),
      ['default'],
    );
  });

  it('imports journey backups without overwriting device sync or sharing state', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT COALESCE(SUM(miles)')) {
        return { rows: [{ miles: 3, steps: 6000 }] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await expect(
      database.importJourneyBackup({
        app: 'MiddleEarthChallenge',
        schemaVersion: 1,
        exportedAt: '2026-09-02T12:00:00.000Z',
        settings: {
          labelSize: 'large',
          textSize: 'small',
          currentTheme: 'classic',
          showPointLabels: false,
          colorizeMap: false,
          reducedMapTitles: false,
          devMode: true,
          useMiles: false,
          lastNotifiedCheckpointIndex: 3,
        },
        distanceEntries: [
          {
            id: 'manual-1',
            saveId: 'default',
            date: 1,
            miles: 1,
            steps: 2000,
            source: 'manual-distance',
          },
          {
            id: 'pedo-1',
            saveId: 'default',
            date: 2,
            miles: 2,
            steps: 4000,
            source: 'pedometer',
          },
        ],
        troubleshootingIssues: [
          {
            slot: 'health-app',
            error: { kind: 'provider', provider: 'health-connect' },
            at: 10,
            dismissedAt: null,
            resolvedAt: 20,
          },
        ],
      }),
    ).resolves.toEqual({ miles: 3, steps: 6000 });

    const settingsUpdate = mockDb.executeSync.mock.calls.find(([sql]) =>
      String(sql).includes('SET label_size = ?'),
    )?.[0] as string;
    expect(settingsUpdate).toBeTruthy();
    expect(settingsUpdate).not.toContain('sync_enabled');
    expect(settingsUpdate).not.toContain('sync_provider');
    expect(settingsUpdate).not.toContain('pedometer_cursor');
    expect(settingsUpdate).not.toContain('sharing_');
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      'DELETE FROM distance_entries WHERE save_id = ?',
      ['default'],
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO troubleshooting_issues'),
      [
        'health-app',
        JSON.stringify({ kind: 'provider', provider: 'health-connect' }),
        10,
        null,
        20,
      ],
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith('COMMIT');
  });

  const schemaV2Backup = (
    sharing: {
      enabled: boolean;
      userId: string | null;
      displayName: string | null;
      affinity: 'river' | 'woodland' | 'hills' | null;
    } | null,
  ) => ({
    app: 'MiddleEarthChallenge' as const,
    schemaVersion: 2 as const,
    exportedAt: '2026-09-02T12:00:00.000Z',
    settings: {
      labelSize: 'large' as const,
      textSize: 'small' as const,
      currentTheme: 'classic' as const,
      showPointLabels: false,
      colorizeMap: false,
      reducedMapTitles: false,
      devMode: true,
      useMiles: false,
      lastNotifiedCheckpointIndex: 3,
    },
    distanceEntries: [],
    troubleshootingIssues: [],
    ...(sharing ? { sharing } : {}),
  });

  it('records the exported sharing identity for cleanup when the backup has active sharing', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT COALESCE(SUM(miles)')) {
        return { rows: [{ miles: 0, steps: 0 }] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await database.importJourneyBackup(
      schemaV2Backup({
        enabled: true,
        userId: 'exported-user-id',
        displayName: 'Penny Greycloak',
        affinity: 'woodland',
      }),
    );

    const sharingUpdate = mockDb.executeSync.mock.calls.find(([sql]) =>
      String(sql).includes('sharing_migration_source_user_id = ?'),
    );
    expect(sharingUpdate).toBeTruthy();
    expect(sharingUpdate?.[1]).toEqual([
      'Penny Greycloak',
      'woodland',
      'exported-user-id',
      'default',
    ]);
  });

  it('does not touch sharing columns when the backup has no active sharing', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT COALESCE(SUM(miles)')) {
        return { rows: [{ miles: 0, steps: 0 }] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await database.importJourneyBackup(
      schemaV2Backup({
        enabled: false,
        userId: null,
        displayName: null,
        affinity: null,
      }),
    );

    const sharingUpdate = mockDb.executeSync.mock.calls.find(([sql]) =>
      String(sql).includes('sharing_migration_source_user_id'),
    );
    expect(sharingUpdate).toBeUndefined();
  });

  it('preserves destination sharing state when the CASE guard sees existing sharing intent', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT COALESCE(SUM(miles)')) {
        return { rows: [{ miles: 0, steps: 0 }] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await database.importJourneyBackup(
      schemaV2Backup({
        enabled: true,
        userId: 'exported-user-id',
        displayName: 'Penny Greycloak',
        affinity: 'woodland',
      }),
    );

    const sharingUpdateSql = mockDb.executeSync.mock.calls.find(([sql]) =>
      String(sql).includes('sharing_migration_source_user_id = ?'),
    )?.[0] as string;
    // The destination-preservation guard must gate every mutable sharing
    // column, not just display name/affinity, or a partially-configured
    // destination could be silently clobbered by the imported profile.
    expect(sharingUpdateSql).toContain(
      'WHEN sharing_enabled = 1 OR sharing_provisioning_pending = 1 OR sharing_deletion_pending = 1',
    );
    expect(sharingUpdateSql).toContain('sharing_display_name = CASE');
    expect(sharingUpdateSql).toContain('sharing_affinity_selection = CASE');
    expect(sharingUpdateSql).toContain('sharing_provisioning_pending = CASE');
    expect(sharingUpdateSql).toContain('last_published_miles = CASE');
    expect(sharingUpdateSql).toContain('last_shared_progress_sync_at = CASE');
  });

  it('rolls back health entries when cursor and format persistence fails', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE user_settings')) {
        throw new Error('checkpoint write failed');
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();

    await expect(
      database.applyHealthSyncChunk(
        'default',
        [
          {
            id: 'hc_live-step-id',
            saveId: 'default',
            date: 1,
            miles: 1,
            steps: 2000,
            source: 'health-connect',
          },
        ],
        2,
        1,
        1,
      ),
    ).rejects.toThrow('checkpoint write failed');

    expect(mockDb.executeSync).toHaveBeenCalledWith('BEGIN TRANSACTION');
    expect(mockDb.executeSync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.executeSync).not.toHaveBeenCalledWith('COMMIT');
  });

  it('rejects additive health entries when persisted mode is dual', async () => {
    const mockDb = createMockDatabase();
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT tracking_mode, sync_enabled, sync_provider')) {
        return {
          rows: [
            {
              tracking_mode: 'dual',
              sync_enabled: 1,
              sync_provider: 'health-connect',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      database.applyHealthSyncChunk(
        'default',
        [
          {
            id: 'late-health-row',
            saveId: 'default',
            date: 1,
            miles: 1,
            steps: 2,
            source: 'health-connect',
          },
        ],
        2,
        1,
        1,
      ),
    ).resolves.toEqual({ applied: false });

    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT OR REPLACE INTO distance_entries'),
      ),
    ).toBe(false);
  });

  it('rolls back pedometer entries when cursor persistence fails', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SET last_sync_timestamp')) {
        throw new Error('pedometer cursor write failed');
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();

    await expect(
      database.applyPedometerSyncChunk(
        'default',
        [
          {
            id: 'pedo_1',
            saveId: 'default',
            date: 1,
            miles: 1,
            steps: 2000,
            source: 'pedometer',
          },
        ],
        2,
      ),
    ).rejects.toThrow('pedometer cursor write failed');

    expect(mockDb.executeSync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.executeSync).not.toHaveBeenCalledWith('COMMIT');
  });

  it('rolls back reconciliation entries when cursor persistence fails', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SET last_health_reconciled_through')) {
        throw new Error('reconciliation cursor write failed');
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();

    await expect(
      database.applyHealthReconciliationDay(
        'default',
        {
          upsert: [
            {
              id: 'health_reconciliation_2026-08-16',
              saveId: 'default',
              date: 1,
              miles: 1,
              steps: 2000,
              source: 'health-reconciliation',
            },
          ],
        },
        2,
      ),
    ).rejects.toThrow('reconciliation cursor write failed');

    expect(mockDb.executeSync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.executeSync).not.toHaveBeenCalledWith('COMMIT');
  });

  it('rolls back distance deletion when bookmark reset fails', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SET sync_start_date')) {
        throw new Error('bookmark reset failed');
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await expect(
      database.resetDistanceData('default', { clearAll: true }, 2_000, 1_000),
    ).rejects.toThrow('bookmark reset failed');

    expect(mockDb.executeSync).toHaveBeenCalledWith('BEGIN TRANSACTION');
    expect(mockDb.executeSync).toHaveBeenCalledWith(
      'DELETE FROM distance_entries WHERE save_id = ?',
      ['default'],
    );
    expect(mockDb.executeSync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.executeSync).not.toHaveBeenCalledWith('COMMIT');
  });

  it('rejects sync writes at or before the reset boundary', async () => {
    const mockDb = createMockDatabase();
    mockDb.executeSync.mockImplementation((sql: string) => {
      if (sql.includes('SELECT sync_start_date as syncStartDate')) {
        return { rows: [{ syncStartDate: 2_000 }] };
      }
      if (
        sql.includes(
          'SELECT last_health_reconciled_through as lastHealthReconciledThrough',
        )
      ) {
        return { rows: [{ lastHealthReconciledThrough: 1_000 }] };
      }
      return { rows: [] };
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    const staleEntry = {
      id: 'stale-sync-entry',
      saveId: 'default',
      date: 1_500,
      miles: 1,
      steps: 2_000,
      source: 'health-connect' as const,
    };
    const health = await database.applyHealthSyncChunk(
      'default',
      [staleEntry],
      2_000,
      1,
      2_000,
    );
    const pedometer = await database.applyPedometerSyncChunk(
      'default',
      [{ ...staleEntry, source: 'pedometer' }],
      2_000,
    );
    const reconciliation = await database.applyHealthReconciliationDay(
      'default',
      { upsert: [{ ...staleEntry, source: 'health-reconciliation' }] },
      1_000,
    );

    expect(health.applied).toBe(false);
    expect(pedometer.applied).toBe(false);
    expect(reconciliation.applied).toBe(false);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT OR REPLACE INTO distance_entries'),
      ),
    ).toBe(false);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('SELECT COALESCE(SUM(miles)'),
      ),
    ).toBe(false);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('SELECT id, save_id as saveId'),
      ),
    ).toBe(false);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT OR REPLACE INTO progress_snapshot'),
      ),
    ).toBe(false);
  });

  it('leaves persisted and in-memory progress unchanged when recalculation fails', async () => {
    const originalEntry = {
      id: 'manual-1',
      saveId: 'default',
      date: 1,
      miles: 2,
      steps: 4000,
      source: 'manual-distance' as const,
    };
    const mockDb = createTransactionalProgressDb({
      entries: [originalEntry],
      snapshot: { miles: 2, steps: 4000, cacheVersion: 1 },
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    useProgressStore.setState({
      distanceEntries: [originalEntry],
      miles: 2,
      steps: 4000,
    });
    mockDb.failSnapshotWrite();

    await expect(
      useProgressStore.getState().applyDistanceEntryChanges({
        upsert: [
          {
            id: 'manual-2',
            saveId: 'default',
            date: 2,
            miles: 3,
            steps: 6000,
            source: 'manual-distance',
          },
        ],
      }),
    ).rejects.toThrow('snapshot write failed');

    const persisted = mockDb.readState();
    expect([...persisted.entries.values()]).toEqual([originalEntry]);
    expect(persisted.snapshot).toEqual({
      miles: 2,
      steps: 4000,
      cacheVersion: 1,
    });
    expect(useProgressStore.getState()).toMatchObject({
      distanceEntries: [originalEntry],
      miles: 2,
      steps: 4000,
    });
  });

  it('updates a valid snapshot from only the affected rows', async () => {
    const replacedEntry = {
      id: 'manual-1',
      saveId: 'default',
      date: 1,
      miles: 2,
      steps: 4000,
      source: 'manual-distance' as const,
    };
    const unrelatedEntries = Array.from({ length: 1000 }, (_, index) => ({
      id: `unrelated-${index}`,
      saveId: 'default',
      date: index + 2,
      miles: 0.01,
      steps: 20,
      source: 'pedometer' as const,
    }));
    const mockDb = createTransactionalProgressDb({
      entries: [replacedEntry, ...unrelatedEntries],
      snapshot: { miles: 12, steps: 24_000, cacheVersion: 1 },
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.executeSync.mockClear();

    await expect(
      database.applyDistanceEntryChanges('default', {
        upsert: [{ ...replacedEntry, miles: 5, steps: 10_000 }],
      }),
    ).resolves.toMatchObject({ miles: 15, steps: 30_000 });

    const readQueries = mockDb.executeSync.mock.calls.filter(([sql]) =>
      String(sql).includes('SELECT id, save_id as saveId'),
    );
    expect(readQueries).toHaveLength(1);
    expect(readQueries[0][0]).toEqual(expect.stringContaining('id IN (?)'));
    expect(readQueries[0][1]).toEqual(['default', 'manual-1']);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('SELECT COALESCE(SUM(miles)'),
      ),
    ).toBe(false);
    expect(
      mockDb.executeSync.mock.calls.some(([sql]) =>
        String(sql).includes('ORDER BY date ASC'),
      ),
    ).toBe(false);
  });

  it('repairs an unversioned snapshot from persisted entries', async () => {
    const mockDb = createTransactionalProgressDb({
      entries: [
        {
          id: 'manual-1',
          saveId: 'default',
          date: 1,
          miles: 3,
          steps: 6000,
          source: 'manual-distance',
        },
      ],
      snapshot: { miles: 99, steps: 99, cacheVersion: 0 },
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();

    await expect(database.hydrateProgress('default')).resolves.toMatchObject({
      miles: 3,
      steps: 6000,
    });
    expect(mockDb.readState().snapshot).toEqual({
      miles: 3,
      steps: 6000,
      cacheVersion: 1,
    });
  });

  it('does not advance the pedometer cursor or retain entries on failure', async () => {
    const mockDb = createTransactionalProgressDb({
      snapshot: { miles: 0, steps: 0, cacheVersion: 1 },
      lastSyncTimestamp: 100,
    });
    mockOpen.mockReturnValue(mockDb as never);
    await database.init();
    mockDb.failCursorWrite();

    await expect(
      database.applyPedometerSyncChunk(
        'default',
        [
          {
            id: 'pedo_100',
            saveId: 'default',
            date: 150,
            miles: 1,
            steps: 2000,
            source: 'pedometer',
          },
        ],
        200,
      ),
    ).rejects.toThrow('cursor write failed');

    expect(mockDb.readState()).toMatchObject({
      lastSyncTimestamp: 100,
      snapshot: { miles: 0, steps: 0, cacheVersion: 1 },
    });
    expect(mockDb.readState().entries).toEqual(new Map());
  });
});
