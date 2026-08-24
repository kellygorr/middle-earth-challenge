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
