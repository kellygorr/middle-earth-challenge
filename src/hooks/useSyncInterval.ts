import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { useInitializationStore } from '../stores/initializationStore';
import type { SyncError } from '../stores/progressStore';
import { getActiveFitnessService } from '../services/fitnessService';
import { getBackgroundRefreshStatus } from '../services/backgroundRefreshStatus';
import { DistanceEntry, DistanceSource, HealthDistanceRecord } from '../types';
import {
  SYNC_INTERVAL_MS,
  CHUNK_DAYS,
  CHUNK_TIMEOUT_MS,
  CHUNK_RETRY_DELAY_MS,
  CHUNK_YIELD_MS,
  STALL_ERROR_MS,
} from '../constants/sync';

const METERS_TO_MILES = 0.000621371;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Module-level handle so UI outside the hook (overlay retry button, Settings
 * "Sync now") can request a sync without prop-drilling. Registered by the
 * hook on mount; null when the hook isn't mounted.
 */
let activePerformSync: ((force?: boolean) => Promise<void>) | null = null;

export function requestSyncNow(): Promise<void> {
  return activePerformSync ? activePerformSync(true) : Promise.resolve();
}

export function isSyncRunnerMounted(): boolean {
  return activePerformSync !== null;
}

interface Chunk {
  start: Date;
  end: Date;
}

/**
 * Split [from, to] into ~CHUNK_DAYS-wide chunks, oldest first.
 */
function buildChunks(from: Date, to: Date): Chunk[] {
  if (to.getTime() <= from.getTime()) return [];
  const chunks: Chunk[] = [];
  let cursor = from.getTime();
  const end = to.getTime();
  while (cursor < end) {
    const next = Math.min(cursor + CHUNK_DAYS * MS_PER_DAY, end);
    chunks.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }
  return chunks;
}

/**
 * Race a promise against a timeout. Rejects with Error('chunk-timeout').
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('chunk-timeout')), ms);
    p.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Map a raw thrown value to a typed `SyncError`. Keeps `unknown` as the
 * intentional last resort: anything that doesn't match a more specific
 * pattern stays `unknown`, which the store deliberately doesn't surface
 * to the UI (log only). Add a new branch here when we observe a real
 * failure mode in the wild that we can give the user useful guidance for.
 */
function classifySyncError(error: unknown): SyncError {
  const message = error instanceof Error ? error.message : String(error);
  // Permission / auth: revoked, never granted, or the health app blocked us.
  if (/SecurityException|permission|unauthor/i.test(message)) {
    return { kind: 'permission', message };
  }
  // Provider not installed or out-of-date (Health Connect SDK statuses).
  if (/sdk.*unavailable|not installed|update.*required/i.test(message)) {
    return { kind: 'unavailable', message };
  }
  return { kind: 'unknown', message };
}

/**
 * Hook that manages periodic syncing from health services while the app is foregrounded.
 *
 * Sync runs in CHUNK_DAYS-wide chunks oldest -> newest. Each chunk:
 *   - races getDistanceRecordsBetween against CHUNK_TIMEOUT_MS (retried once)
 *   - advances lastSyncTimestamp on success so resume is cheap
 *   - bumps syncStatus so the UI can decide pill vs overlay and show ETA
 *
 * Live sync (every SYNC_INTERVAL_MS) usually resolves to a single chunk.
 * First sync after a long absence fans out into many chunks; the overlay
 * UI keys off selectIsLongSync().
 */
export function useSyncInterval() {
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const syncStartDate = useSettingsStore(state => state.syncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const setMiles = useProgressStore(state => state.setMiles);
  const setSyncStatus = useProgressStore(state => state.setSyncStatus);
  const addDistanceEntries = useProgressStore(
    state => state.addDistanceEntries,
  );
  const updateDistanceEntry = useProgressStore(
    state => state.updateDistanceEntry,
  );
  // Gate all sync work on the app being past the 'loading' phase. Without
  // this, useSyncInterval's mount-time effect fires performSync against the
  // real Health Connect *before* App.tsx's initApp effect has run
  // database.init / loadSettings / setupDevMockLongSyncIfEnabled. That
  // produced a spurious SecurityException -> "disconnected" message on every
  // reload.
  const initPhase = useInitializationStore(state => state.phase);
  const initReady = initPhase !== 'loading';

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasPerformedInitialSyncRef = useRef(false);
  /** Guards against concurrent performSync() calls (interval + AppState). */
  const inFlightRef = useRef(false);

  const performSync = useCallback(
    async (forceSync = false) => {
      if (
        !syncEnabled ||
        (!liveSyncEnabled && !forceSync) ||
        syncProvider === 'none' ||
        !syncStartDate
      ) {
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const fitness = getActiveFitnessService();
      const healthSource: DistanceSource =
        Platform.OS === 'ios' ? 'apple-health' : 'health-connect';
      const idPrefix = Platform.OS === 'ios' ? 'ah' : 'hc';

      // DEBUG: trace which service is actually wired up at sync time, to
      // diagnose the spurious "disconnected" message on every reload.
      console.log(
        `[useSyncInterval] performSync start service=${
          (fitness as object)?.constructor?.name
        } provider=${syncProvider} force=${forceSync} initialDone=${
          hasPerformedInitialSyncRef.current
        }`,
      );

      const currentLastSync = useSettingsStore.getState().lastSyncTimestamp;
      const fromDate = currentLastSync
        ? new Date(currentLastSync)
        : new Date(syncStartDate);
      const toDate = new Date();
      const chunks = buildChunks(fromDate, toDate);

      // Nothing to fetch - bump timestamp and exit.
      if (chunks.length === 0) {
        setLastSyncTimestamp(Date.now());
        inFlightRef.current = false;
        return;
      }

      const startedAt = Date.now();
      setSyncStatus({
        phase: 'syncing',
        chunksDone: 0,
        chunksTotal: chunks.length,
        milesAdded: 0,
        startedAt,
        lastProgressAt: startedAt,
        error: null,
      });

      try {
        await fitness.initialize(syncProvider);

        let totalMilesAdded = 0;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          // Per-chunk fetch with timeout + single retry.
          let records: HealthDistanceRecord[] | null = null;
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              records = await withTimeout(
                fitness.getDistanceRecordsBetween(chunk.start, chunk.end),
                CHUNK_TIMEOUT_MS,
              );
              break;
            } catch (e) {
              lastErr = e;
              const msg = String(e);
              // Permission errors: fail fast, no retry.
              if (
                msg.includes('SecurityException') ||
                msg.includes('permission')
              ) {
                throw e;
              }
              // Stalled too long overall? Bail.
              if (Date.now() - startedAt > STALL_ERROR_MS) {
                throw e;
              }
              if (attempt === 0) {
                await new Promise<void>(resolve =>
                  setTimeout(() => resolve(), CHUNK_RETRY_DELAY_MS),
                );
              }
            }
          }

          if (records === null) {
            const err =
              lastErr instanceof Error ? lastErr : new Error('chunk-failed');
            const syncErr: SyncError =
              err.message === 'chunk-timeout'
                ? {
                    kind: 'timeout',
                    chunkStart: chunk.start.getTime(),
                    chunkEnd: chunk.end.getTime(),
                    chunksDone: i,
                    chunksTotal: chunks.length,
                  }
                : classifySyncError(err);
            setSyncStatus(prev => ({
              ...prev,
              phase: 'error',
              error: syncErr,
            }));
            return;
          }

          const milesAddedThisChunk = await ingestRecords(
            records,
            healthSource,
            idPrefix,
            addDistanceEntries,
            updateDistanceEntry,
          );
          totalMilesAdded += milesAddedThisChunk;

          // Roll total from entries; cheap, entries already updated.
          const currentEntries = useProgressStore.getState().distanceEntries;
          const totalMiles = currentEntries.reduce(
            (sum, e) => sum + (e?.miles ?? 0),
            0,
          );
          setMiles(totalMiles);

          // Per-chunk timestamp: if we crash/quit, we resume from here.
          setLastSyncTimestamp(Math.min(chunk.end.getTime(), toDate.getTime()));

          setSyncStatus(prev =>
            prev.phase === 'syncing'
              ? {
                  ...prev,
                  chunksDone: i + 1,
                  milesAdded: totalMilesAdded,
                  lastProgressAt: Date.now(),
                }
              : prev,
          );

          if (CHUNK_YIELD_MS >= 0) {
            await new Promise<void>(resolve =>
              setTimeout(() => resolve(), CHUNK_YIELD_MS),
            );
          }
        }

        await useProgressStore.getState().persistMilesSnapshot();

        setSyncStatus({
          phase: 'idle',
          chunksDone: chunks.length,
          chunksTotal: chunks.length,
          milesAdded: totalMilesAdded,
          startedAt,
          lastProgressAt: Date.now(),
          error: null,
        });
      } catch (error) {
        console.error('[useSyncInterval] Sync error caught:', error);
        const classified = classifySyncError(error);
        console.log('[useSyncInterval] classify error', {
          kind: classified.kind,
          errorName: (error as Error)?.name,
          errorMessage:
            classified.kind === 'unknown'
              ? classified.message
              : (classified as { message?: string }).message,
        });
        if (classified.kind === 'permission') {
          // Flip syncEnabled off so we don't keep retrying with no auth.
          // The banner copy now lives in SyncErrorBanner; the typed error
          // is enough — no need to template a long message here.
          setSyncStatus(prev => ({
            ...prev,
            phase: 'error',
            error: classified,
          }));
          setSyncEnabled(false);
        } else {
          setSyncStatus(prev => ({
            ...prev,
            phase: 'error',
            error: classified,
          }));
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      syncEnabled,
      liveSyncEnabled,
      syncProvider,
      syncStartDate,
      addDistanceEntries,
      updateDistanceEntry,
      setMiles,
      setLastSyncTimestamp,
      setSyncStatus,
      setSyncEnabled,
    ],
  );

  useEffect(() => {
    const startInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (syncEnabled && liveSyncEnabled && appStateRef.current === 'active') {
        performSync();
        intervalRef.current = setInterval(performSync, SYNC_INTERVAL_MS);
      }
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current.match(/inactive|background/) !== null;
      const isActive = nextAppState === 'active';

      if (wasBackground && isActive) {
        if (syncEnabled) {
          performSync(true);
        }
        if (liveSyncEnabled) {
          startInterval();
        }
      } else if (!isActive && appStateRef.current === 'active') {
        stopInterval();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    if (syncEnabled && initReady && !hasPerformedInitialSyncRef.current) {
      hasPerformedInitialSyncRef.current = true;
      performSync(true);
    }

    if (syncEnabled && liveSyncEnabled && initReady) {
      startInterval();
    } else {
      stopInterval();
    }

    return () => {
      subscription.remove();
      stopInterval();
    };
  }, [syncEnabled, liveSyncEnabled, initReady, performSync]);

  // iOS: detect Background App Refresh being off, so we can warn the user
  // that "live sync" won't actually happen in the background. Runs on
  // mount, on every foreground resume, and when sync gets enabled.
  // No-op on Android and when syncing is off.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !syncEnabled) return;

    let cancelled = false;
    const check = async () => {
      const status = await getBackgroundRefreshStatus();
      if (cancelled) return;
      const state = useProgressStore.getState();
      const { lastSyncError } = state;

      if (status === 'denied' || status === 'restricted') {
        // Only surface if nothing more important is already showing. A real
        // permission/timeout/unavailable error is higher priority — we
        // don't want to clobber it with an environmental advisory.
        if (lastSyncError === null) {
          state.setSyncStatus({
            ...state.syncStatus,
            phase: 'error',
            error: { kind: 'backgroundDisabled' },
          });
        }
      } else if (
        status === 'available' &&
        lastSyncError?.kind === 'backgroundDisabled'
      ) {
        // User flipped the iOS Settings switch back on — clear the banner.
        state.clearLastSyncError();
      }
    };

    check();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [syncEnabled]);

  // Register/unregister this hook instance as the active sync runner.
  useEffect(() => {
    activePerformSync = performSync;
    return () => {
      if (activePerformSync === performSync) {
        activePerformSync = null;
      }
    };
  }, [performSync]);

  return { performSync };
}

/**
 * Ingest one chunk's worth of health records into the progress store.
 * Returns net miles added (new + updated diffs) for status reporting.
 */
async function ingestRecords(
  records: HealthDistanceRecord[],
  healthSource: DistanceSource,
  idPrefix: string,
  addDistanceEntries: (entries: DistanceEntry[]) => Promise<void>,
  updateDistanceEntry: (e: DistanceEntry) => Promise<void>,
): Promise<number> {
  if (records.length === 0) return 0;

  const existingEntries = useProgressStore
    .getState()
    .distanceEntries.filter(e => e.source === healthSource);
  const existingEntriesMap = new Map(existingEntries.map(e => [e.id, e]));

  // Only one record in our DB can plausibly be amended by the upstream health
  // app: the most-recent one. Older records are treated as finalized — both
  // because real Health Connect doesn't go back and mutate old data, and
  // because the user may have manually edited those rows via the + button.
  // Capturing this id once lets us skip the miles diff on every other record.
  const latestExistingId = existingEntries.length
    ? existingEntries.reduce((latest, e) =>
        (e.date as number) > (latest.date as number) ? e : latest,
      ).id
    : null;

  const saveId = 'default';
  let milesChanged = 0;

  const toAdd: DistanceEntry[] = [];
  const toUpdate: DistanceEntry[] = [];

  for (const record of records) {
    const entryId = `${idPrefix}_${record.id}`;

    // Fast path: never seen this id → straight to insert. Backfills hit this
    // exclusively, so we never pay the miles-diff cost for thousands of rows.
    if (!existingEntriesMap.has(entryId)) {
      const miles = record.distanceMeters * METERS_TO_MILES;
      toAdd.push({
        id: entryId,
        saveId,
        date: new Date(record.startTime).getTime(),
        miles,
        source: healthSource,
      });
      milesChanged += miles;
      continue;
    }

    // Known id, but not the one amendable record → ignore. Preserves user
    // edits to older days and avoids unnecessary diff computation.
    if (entryId !== latestExistingId) continue;

    // Known id AND it's our one amendable record → diff and maybe update.
    const existing = existingEntriesMap.get(entryId)!;
    const miles = record.distanceMeters * METERS_TO_MILES;
    if (Math.abs(existing.miles - miles) > 0.001) {
      toUpdate.push({ ...existing, miles });
      milesChanged += miles - existing.miles;
    }
  }

  // Single batched store update + single SQLite transaction per chunk.
  // Replaces hundreds of awaited per-record writes that previously blocked
  // the JS thread for ~30s on the first chunk under Android sample volume.
  if (toAdd.length > 0) {
    await addDistanceEntries(toAdd);
  }
  for (const entry of toUpdate) {
    await updateDistanceEntry(entry);
  }

  return milesChanged;
}
