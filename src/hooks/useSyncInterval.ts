import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import type { SyncError } from '../stores/progressStore';
import { getActiveFitnessService } from '../services/fitnessService';
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
  const useMiles = useSettingsStore(state => state.useMiles);
  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const updateDistanceEntry = useProgressStore(
    state => state.updateDistanceEntry,
  );

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
                : { kind: 'unknown', message: err.message };
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
            addDistanceEntry,
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
        const errorMessage = String(error);
        if (
          errorMessage.includes('SecurityException') ||
          errorMessage.includes('permission')
        ) {
          const message = `It looks like your health data connection was disconnected. If this was unintentional, you can reconnect here or in Settings. Otherwise, you can continue adding ${
            useMiles ? 'miles' : 'kilometers'
          } using the + button.`;
          setSyncStatus(prev => ({
            ...prev,
            phase: 'error',
            error: { kind: 'permission', message },
          }));
          setSyncEnabled(false);
        } else {
          setSyncStatus(prev => ({
            ...prev,
            phase: 'error',
            error: { kind: 'unknown', message: errorMessage },
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
      useMiles,
      addDistanceEntry,
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

    if (syncEnabled && !hasPerformedInitialSyncRef.current) {
      hasPerformedInitialSyncRef.current = true;
      performSync(true);
    }

    if (syncEnabled && liveSyncEnabled) {
      startInterval();
    } else {
      stopInterval();
    }

    return () => {
      subscription.remove();
      stopInterval();
    };
  }, [syncEnabled, liveSyncEnabled, performSync]);

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
  addDistanceEntry: (e: DistanceEntry) => Promise<void>,
  updateDistanceEntry: (e: DistanceEntry) => Promise<void>,
): Promise<number> {
  if (records.length === 0) return 0;

  const existingEntriesMap = new Map(
    useProgressStore
      .getState()
      .distanceEntries.filter(e => e.source === healthSource)
      .map(e => [e.id, e]),
  );

  // Most-recent record in chunk is the only one we treat as in-progress
  // and allow to update; older diffs are user-modified entries and preserved.
  const mostRecentRecordId = records.reduce((latest, r) =>
    new Date(r.startTime).getTime() > new Date(latest.startTime).getTime()
      ? r
      : latest,
  ).id;

  const saveId = 'default';
  let milesChanged = 0;

  for (const record of records) {
    const entryId = `${idPrefix}_${record.id}`;
    const miles = record.distanceMeters * METERS_TO_MILES;
    const existing = existingEntriesMap.get(entryId);

    if (!existing) {
      const entry: DistanceEntry = {
        id: entryId,
        saveId,
        date: new Date(record.startTime).getTime(),
        miles,
        source: healthSource,
      };
      await addDistanceEntry(entry);
      milesChanged += miles;
    } else if (
      Math.abs(existing.miles - miles) > 0.001 &&
      record.id === mostRecentRecordId
    ) {
      await updateDistanceEntry({ ...existing, miles });
      milesChanged += miles - existing.miles;
    }
  }

  return milesChanged;
}
