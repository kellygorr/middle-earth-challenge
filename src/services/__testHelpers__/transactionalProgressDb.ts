import type { DistanceEntry } from '../../types';

interface Snapshot {
  miles: number;
  steps: number;
  cacheVersion: number;
}

interface State {
  entries: Map<string, DistanceEntry>;
  snapshot: Snapshot | null;
  lastSyncTimestamp: number | null;
}

const cloneState = (state: State): State => ({
  entries: new Map([...state.entries].map(([id, entry]) => [id, { ...entry }])),
  snapshot: state.snapshot ? { ...state.snapshot } : null,
  lastSyncTimestamp: state.lastSyncTimestamp,
});

export function createTransactionalProgressDb(initial?: {
  entries?: DistanceEntry[];
  snapshot?: Snapshot;
  lastSyncTimestamp?: number;
}) {
  let state: State = {
    entries: new Map((initial?.entries ?? []).map(entry => [entry.id, entry])),
    snapshot: initial?.snapshot ? { ...initial.snapshot } : null,
    lastSyncTimestamp: initial?.lastSyncTimestamp ?? null,
  };
  let transactionStart: State | null = null;
  let failNextSnapshotWrite = false;
  let failNextCursorWrite = false;

  const executeSync = jest.fn((sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'BEGIN TRANSACTION') {
      transactionStart = cloneState(state);
      return { rows: [] };
    }
    if (normalized === 'COMMIT') {
      transactionStart = null;
      return { rows: [] };
    }
    if (normalized === 'ROLLBACK') {
      if (transactionStart) state = transactionStart;
      transactionStart = null;
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT OR REPLACE INTO distance_entries')) {
      const [id, saveId, date, miles, steps, source] = params;
      state.entries.set(String(id), {
        id: String(id),
        saveId: String(saveId),
        date: Number(date),
        miles: Number(miles),
        steps: Number(steps),
        source: String(source) as DistanceEntry['source'],
      });
      return { rows: [] };
    }

    if (normalized.includes('SELECT COALESCE(SUM(miles)')) {
      const saveId = String(params[0]);
      const entries = [...state.entries.values()].filter(
        entry => entry.saveId === saveId,
      );
      return {
        rows: [
          {
            miles: entries.reduce((total, entry) => total + entry.miles, 0),
            steps: entries.reduce((total, entry) => total + entry.steps, 0),
          },
        ],
      };
    }

    if (normalized.startsWith('INSERT OR REPLACE INTO progress_snapshot')) {
      if (failNextSnapshotWrite) {
        failNextSnapshotWrite = false;
        throw new Error('snapshot write failed');
      }
      state.snapshot = {
        miles: Number(params[1]),
        steps: Number(params[2]),
        cacheVersion: Number(params[3]),
      };
      return { rows: [] };
    }

    if (normalized.includes('SELECT miles, steps, cache_version')) {
      return {
        rows: state.snapshot
          ? [
              {
                miles: state.snapshot.miles,
                steps: state.snapshot.steps,
                cache_version: state.snapshot.cacheVersion,
              },
            ]
          : [],
      };
    }

    if (normalized.startsWith('SELECT id, save_id as saveId')) {
      const saveId = String(params[0]);
      const idPlaceholders = normalized.match(/id IN \(([^)]*)\)/)?.[1];
      const idCount = idPlaceholders?.split(',').length ?? 0;
      const ids = new Set(params.slice(1, 1 + idCount).map(String));
      const sourcePlaceholders = normalized.match(/source IN \(([^)]*)\)/)?.[1];
      const sourceCount = sourcePlaceholders?.split(',').length ?? 0;
      const sources = new Set(
        params.slice(1 + idCount, 1 + idCount + sourceCount).map(String),
      );
      return {
        rows: [...state.entries.values()]
          .filter(
            entry =>
              entry.saveId === saveId &&
              (idCount + sourceCount === 0 ||
                ids.has(entry.id) ||
                sources.has(entry.source)),
          )
          .sort((left, right) => Number(left.date) - Number(right.date)),
      };
    }

    if (normalized.includes('SET last_sync_timestamp')) {
      if (failNextCursorWrite) {
        failNextCursorWrite = false;
        throw new Error('cursor write failed');
      }
      state.lastSyncTimestamp = Number(params[0]);
      return { rows: [] };
    }

    return { rows: [] };
  });

  return {
    executeSync,
    close: jest.fn(),
    failSnapshotWrite: () => {
      failNextSnapshotWrite = true;
    },
    failCursorWrite: () => {
      failNextCursorWrite = true;
    },
    readState: () => cloneState(state),
  };
}
