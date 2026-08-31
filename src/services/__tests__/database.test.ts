import { open } from '@op-engineering/op-sqlite';

import { database } from '../database';
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
    await expect(database.init()).resolves.toBeUndefined();

    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(failedDb.close).toHaveBeenCalledTimes(1);
    expect(retryDb.close).not.toHaveBeenCalled();
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
    await expect(database.init()).resolves.toBeUndefined();

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
