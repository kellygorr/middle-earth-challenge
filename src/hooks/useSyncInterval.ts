import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { useInitializationStore } from '../stores/initializationStore';
import type { SyncError } from '../stores/progressStore';
import { getActiveFitnessService } from '../services/fitnessService';
import { getBackgroundRefreshStatus } from '../services/backgroundRefreshStatus';
import { pedometerService } from '../services/pedometerService';
import { commitPedometerRange } from '../services/pedometerCommit';
import { DistanceSource, HealthDistanceRecord } from '../types';
import {
  SYNC_INTERVAL_MS,
  PEDOMETER_LIVE_COMMIT_INTERVAL_MS,
  CHUNK_DAYS,
  HEALTH_SYNC_LOOKBACK_MS,
  CHUNK_TIMEOUT_MS,
  CHUNK_RETRY_DELAY_MS,
  CHUNK_YIELD_MS,
  STALL_ERROR_MS,
} from '../constants/sync';
import { buildAlignedChunks, buildChunks } from '../utils/chunkRange';
import { reconcileCompletedDualTrackingDays } from '../services/dualSourceReconciliation';
import { switchTrackingMode } from '../services/trackingModeService';
import { classifySyncError } from '../services/syncErrorClassification';
import {
  getHealthSyncFormatForChunk,
  getHealthSyncStartTimestamp,
  getHealthLookbackStartForChunk,
} from '../services/healthSyncCutover';
import { buildHealthDistanceEntryChanges } from '../services/healthDistanceEntries';

/**
 * Module-level handle so UI outside the hook (overlay retry button, Settings
 * "Sync now") can request a sync without prop-drilling. Registered by the
 * hook on mount; null when the hook isn't mounted.
 */
let activePerformSync:
  | ((force?: boolean, reconcileDual?: boolean) => Promise<void>)
  | null = null;

export function requestSyncNow(): Promise<void> {
  return activePerformSync ? activePerformSync(true, true) : Promise.resolve();
}

export function isSyncRunnerMounted(): boolean {
  return activePerformSync !== null;
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
  const updateSyncSettings = useSettingsStore(
    state => state.updateSyncSettings,
  );
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const syncStartDate = useSettingsStore(state => state.syncStartDate);
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const setSyncStatus = useProgressStore(state => state.setSyncStatus);
  const applyHealthSyncChunk = useProgressStore(
    state => state.applyHealthSyncChunk,
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
    async (forceSync = false, reconcileDual = false) => {
      // Pedometer mode has its own, much simpler flow: read a single
      // step-count window from the native service and ingest it as one
      // entry. It does *not* require syncEnabled / syncProvider /
      // liveSyncEnabled because the tracking service itself is the
      // "provider", and it polls unconditionally while the user has
      // chosen pedometer mode.
      if (trackingMode === 'pedometer' || trackingMode === 'dual') {
        if (inFlightRef.current) return;
        if (!pedometerService.isSupported()) return;
        inFlightRef.current = true;
        try {
          await performPedometerSync({
            forceSync,
            setSyncStatus,
          });
          if (
            trackingMode === 'dual' &&
            reconcileDual &&
            syncProvider !== 'none'
          ) {
            try {
              await reconcileCompletedDualTrackingDays();
            } catch (error) {
              const classified = classifySyncError(error);
              if (classified.kind === 'permission') {
                await switchTrackingMode('pedometer');
                await useSettingsStore.getState().updateSyncSettings({
                  syncProvider: 'none',
                });
              }
              throw error;
            }
          }
        } catch (error) {
          if (trackingMode === 'dual') {
            const classified = classifySyncError(error);
            setSyncStatus(prev => ({
              ...prev,
              phase: 'error',
              error: classified,
            }));
          } else {
            throw error;
          }
        } finally {
          inFlightRef.current = false;
        }
        return;
      }

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
      if (__DEV__) {
        console.log(
          `[useSyncInterval] performSync start service=${
            (fitness as object)?.constructor?.name
          } provider=${syncProvider} force=${forceSync} initialDone=${
            hasPerformedInitialSyncRef.current
          }`,
        );
      }

      const currentLastSync = useSettingsStore.getState().lastSyncTimestamp;
      const healthSyncFormatVersion =
        useSettingsStore.getState().healthSyncFormatVersion;
      let healthLookbackStartTimestamp =
        useSettingsStore.getState().healthLookbackStartTimestamp;
      const chunkWidthMs = CHUNK_DAYS * 24 * 60 * 60 * 1000;
      const fromDate = new Date(
        getHealthSyncStartTimestamp(
          currentLastSync,
          syncStartDate,
          healthLookbackStartTimestamp,
          HEALTH_SYNC_LOOKBACK_MS,
          chunkWidthMs,
        ),
      );
      const toDate = new Date();
      const usesAggregateIds =
        Platform.OS !== 'android' || healthSyncFormatVersion !== 0;
      const chunks = usesAggregateIds
        ? buildAlignedChunks(fromDate, toDate, CHUNK_DAYS)
        : buildChunks(fromDate, toDate, CHUNK_DAYS);

      // Nothing to fetch - bump timestamp and exit.
      if (chunks.length === 0) {
        const cursor = Date.now();
        await applyHealthSyncChunk(
          [],
          cursor,
          Platform.OS === 'android' ? 1 : healthSyncFormatVersion,
          healthLookbackStartTimestamp ?? cursor,
        );
        useSettingsStore.setState({
          lastSyncTimestamp: cursor,
          healthSyncFormatVersion:
            Platform.OS === 'android' ? 1 : healthSyncFormatVersion,
          healthLookbackStartTimestamp: healthLookbackStartTimestamp ?? cursor,
        });
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
              const readRecords =
                Platform.OS === 'android' && healthSyncFormatVersion === 0
                  ? fitness.getLegacyDistanceRecordsBetween.bind(fitness)
                  : fitness.getDistanceRecordsBetween.bind(fitness);
              records = await withTimeout(
                readRecords(chunk.start, chunk.end),
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

          const { entries, milesChanged: milesAddedThisChunk } =
            buildHealthDistanceEntryChanges(
              records,
              healthSource,
              idPrefix,
              useProgressStore.getState().distanceEntries,
            );
          const cursor = Math.min(chunk.end.getTime(), toDate.getTime());
          const nextFormatVersion = getHealthSyncFormatForChunk(
            Platform.OS,
            healthSyncFormatVersion,
            i,
            chunks.length,
          );
          healthLookbackStartTimestamp = getHealthLookbackStartForChunk(
            Platform.OS,
            healthSyncFormatVersion,
            nextFormatVersion,
            healthLookbackStartTimestamp,
            chunk.start.getTime(),
            cursor,
          );
          await applyHealthSyncChunk(
            entries,
            cursor,
            nextFormatVersion,
            healthLookbackStartTimestamp,
          );
          useSettingsStore.setState({
            lastSyncTimestamp: cursor,
            healthSyncFormatVersion: nextFormatVersion,
            healthLookbackStartTimestamp,
          });
          totalMilesAdded += milesAddedThisChunk;

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
          await updateSyncSettings({ syncEnabled: false });
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
      trackingMode,
      applyHealthSyncChunk,
      setSyncStatus,
      updateSyncSettings,
    ],
  );

  useEffect(() => {
    // Whether periodic polling should be on right now. Pedometer mode
    // always polls (the foreground service is the data source; there's
    // no reason to skip a cheap DB read). Health-app mode still gates on
    // syncEnabled + liveSyncEnabled to preserve battery and API budget.
    const usesPedometer =
      trackingMode === 'pedometer' || trackingMode === 'dual';
    const shouldPoll = usesPedometer || (syncEnabled && liveSyncEnabled);

    // Whether an initial "catch me up right now" sync should fire once
    // the app is ready. Pedometer mode wants an immediate read on mount
    // so the UI reflects steps taken between the last app close and now.
    const shouldRunInitialSync = usesPedometer || syncEnabled;

    const startInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (shouldPoll && appStateRef.current === 'active') {
        performSync();
        // Pedometer mode commits every 2 minutes (see
        // PEDOMETER_LIVE_COMMIT_INTERVAL_MS) — the foreground service
        // is already accumulating raw step samples in native SQLite, so
        // the JS-side "commit" is only about *materializing* a row and
        // advancing the watermark. A separate 2s display-refresh timer
        // lives on the map screen for the always-current miles counter.
        const intervalMs = usesPedometer
          ? PEDOMETER_LIVE_COMMIT_INTERVAL_MS
          : SYNC_INTERVAL_MS;
        intervalRef.current = setInterval(performSync, intervalMs);
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
        if (shouldRunInitialSync) {
          performSync(true, true);
        }
        if (shouldPoll) {
          startInterval();
        }
      } else if (!isActive && appStateRef.current === 'active') {
        stopInterval();
        // Pedometer mode: flush the tail window before JS pauses. Otherwise
        // the (up to 2-min) steps since the last commit would only be
        // materialized on next foreground/WorkManager tick, and would be
        // silently dropped entirely if the user switched modes while
        // backgrounded. Fire-and-forget: RN gives us ~5s before it kills
        // timers, which is plenty for a single native call + SQLite write.
        if (usesPedometer) {
          performSync(true, false).catch(err =>
            console.warn(
              '[useSyncInterval] pedometer background-flush failed:',
              err,
            ),
          );
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    if (
      shouldRunInitialSync &&
      initReady &&
      !hasPerformedInitialSyncRef.current
    ) {
      hasPerformedInitialSyncRef.current = true;
      performSync(true, true);
    }

    if (shouldPoll && initReady) {
      startInterval();
    } else {
      stopInterval();
    }

    return () => {
      subscription.remove();
      stopInterval();
    };
  }, [syncEnabled, liveSyncEnabled, trackingMode, initReady, performSync]);

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
      const hasBackgroundIssue = state.syncIssues.some(
        issue => issue.error.kind === 'backgroundDisabled',
      );

      if (status === 'denied' || status === 'restricted') {
        // Its own slot, so it no longer has to yield to a source error.
        if (!hasBackgroundIssue) {
          state.addSyncIssue({ kind: 'backgroundDisabled' });
        }
      } else if (status === 'available' && hasBackgroundIssue) {
        // User flipped the iOS Settings switch back on — condition fixed.
        state.resolveSyncIssue('app');
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
 * Pedometer mode's commit: read `getStepsBetween(watermark, now)`, write
 * at most one `DistanceEntry` for that window (via
 * `commitPedometerRange`), then advance the watermark
 * (`lastSyncTimestamp`) to `now`.
 *
 * See docs/pedometer-mode.md § "Row model & commit strategy" for the
 * full model. Called from every commit trigger — 2-min live tick,
 * AppState → 'active' (catch-up), AppState → 'background' (flush),
 * WorkManager sweep, mode-switch flush, Sync-Now button — with the
 * same semantics each time.
 *
 * Empty windows produce no row (idle overnight periods don't clutter
 * the day view). Row length is whatever the window covers — 2 min
 * during live, ~4.8h during WorkManager, or arbitrary at edges.
 *
 * If the foreground service has been killed (OEM battery manager,
 * force-stop), forced ticks surface `kind: 'pedometerStopped'` so the
 * banner can point the user at `openOemBatterySettings`.
 */
async function performPedometerSync(args: {
  forceSync: boolean;
  setSyncStatus: ReturnType<typeof useProgressStore.getState>['setSyncStatus'];
}): Promise<void> {
  const { forceSync, setSyncStatus } = args;

  const now = Date.now();
  const watermark = useSettingsStore.getState().lastSyncTimestamp;

  // No watermark yet (first-ever pedometer tick after switch) means the
  // switch handler already set lastSyncTimestamp = switch-instant, so
  // this branch is unreachable in practice. Guard anyway: skip the
  // commit and stamp `now` so subsequent ticks have a starting point.
  if (!watermark) {
    await useProgressStore.getState().applyPedometerSyncChunk([], now);
    useSettingsStore.setState({ lastSyncTimestamp: now });
    return;
  }

  // Nothing to do if no time has passed. Common on double-fires (e.g.
  // AppState → active immediately after a scheduled 2-min tick).
  if (now <= watermark) {
    return;
  }

  // Service-alive check only on forced ticks (Sync-Now button, AppState
  // → active, WorkManager). Skips the roundtrip on the routine 2-min
  // live tick. If the service is dead we bail *before* the read so we
  // don't materialize a bogus zero-step row. We deliberately don't
  // surface an error here — we can't reliably tell if the cause is an
  // OEM battery manager, a revoked permission, or a race during boot,
  // so a confident "Android stopped the service" banner would misinform.
  if (forceSync) {
    try {
      const running = await pedometerService.isServiceRunning();
      if (!running) {
        return;
      }
    } catch (error) {
      console.warn('[pedometer] isServiceRunning check failed:', error);
    }
  }

  let result;
  try {
    result = await commitPedometerRange(watermark, now);
  } catch (error) {
    setSyncStatus(prev => ({
      ...prev,
      phase: 'error',
      error: { kind: 'unknown', message: String(error) },
    }));
    // Do NOT advance the watermark on a read failure — next tick will
    // retry the same window.
    return;
  }

  setSyncStatus({
    phase: 'idle',
    chunksDone: 1,
    chunksTotal: 1,
    milesAdded: result.miles,
    startedAt: now,
    lastProgressAt: Date.now(),
    error: null,
  });
}
