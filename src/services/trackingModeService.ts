import { Platform } from 'react-native';
import { TrackingMode } from '../types';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { pedometerService } from './pedometerService';
import { commitPedometerRange } from './pedometerCommit';
import { evaluatePedometerCommitHealth } from './pedometerHealth';
import { startOfLocalDay } from './dualSourceReconciliation';
import { fitnessService } from './fitnessService';

const usesPedometer = (mode: TrackingMode) =>
  mode === 'pedometer' || mode === 'dual';

let trackingModeTransitionsInProgress = 0;

export async function completePendingPedometerCleanup(): Promise<boolean> {
  const settings = useSettingsStore.getState();
  if (!settings.pedometerCleanupPending) return true;

  try {
    const stopped = await pedometerService.stopTracking();
    if (!stopped) return false;
    await useSettingsStore.getState().updateSyncSettings({
      pedometerCleanupPending: false,
    });
    return true;
  } catch (error) {
    console.warn('Pedometer native cleanup failed:', error);
    return false;
  }
}

export type DualPermissionOutcome =
  | 'dual'
  | 'health-app'
  | 'pedometer'
  | 'none'
  | 'unknown';

export function resolveDualPermissionOutcome(
  pedometerAvailable: boolean,
  healthPermission: 'granted' | 'revoked' | 'unknown',
): DualPermissionOutcome {
  if (healthPermission === 'unknown') return 'unknown';
  if (pedometerAvailable && healthPermission === 'granted') return 'dual';
  if (pedometerAvailable) return 'pedometer';
  if (healthPermission === 'granted') return 'health-app';
  return 'none';
}

export function getTrackingModeForSources(
  pedometerEnabled: boolean,
  healthEnabled: boolean,
): TrackingMode | null {
  if (pedometerEnabled && healthEnabled) return 'dual';
  if (pedometerEnabled) return 'pedometer';
  if (healthEnabled) return 'health-app';
  return null;
}

export function getDualModeInitialCursor(
  _previous: TrackingMode,
  now: number,
): number {
  return startOfLocalDay(now);
}

/**
 * Coordinates switching the app's data source between Health Connect /
 * Apple Health ('health-app') and the raw step counter ('pedometer').
 *
 * A mode switch is a hard boundary: any per-mode sync bookkeeping
 * (lastSyncTimestamp, lastSyncDate, current syncStatus, last error) is
 * reset so the new mode starts from a clean cursor. Otherwise, e.g. a
 * stale `lastSyncTimestamp` from a Health Connect sync could cause the
 * pedometer branch to query a window covering data that predated it.
 *
 * When switching *away from* pedometer we must first flush the orphan
 * window `[watermark, now]` into a row, otherwise the reset below
 * silently drops any steps taken since the last 2-minute commit. See
 * docs/pedometer-mode.md § "Row model & commit strategy".
 */

export interface SwitchResult {
  mode: TrackingMode;
  /** True iff the underlying tracking source is actually running. */
  tracking: boolean;
  /**
   * Runtime permission results when switching *to* pedometer mode.
   * Undefined for other switches.
   */
  permissions?: {
    activityRecognition: boolean;
    postNotifications: boolean;
  };
}

/**
 * Switch the app's tracking mode. Safe to call with the current mode —
 * it will re-request permissions / re-start the service if needed.
 */
async function performTrackingModeSwitch(
  mode: TrackingMode,
): Promise<SwitchResult> {
  const settings = useSettingsStore.getState();
  const progress = useProgressStore.getState();
  const previous = settings.trackingMode;
  const transitionAt = Date.now();
  const cleanupRequired =
    usesPedometer(previous) &&
    !usesPedometer(mode) &&
    pedometerService.isSupported();

  // Flush uncommitted pedometer steps BEFORE the watermark is reset
  // below. A failed flush aborts the transition so the existing watermark
  // remains available for retry instead of silently dropping the window.
  if (
    usesPedometer(previous) &&
    mode !== previous &&
    pedometerService.isSupported() &&
    settings.lastSyncTimestamp
  ) {
    await commitPedometerRange(settings.lastSyncTimestamp, transitionAt);
  }

  // Reset per-mode sync bookkeeping so the new mode starts clean.
  // Set lastSyncTimestamp to `now` so the next tick fetches only forward
  // steps / records — never re-ingests history that came from the old
  // source. Users who want backfill can delete progress and re-enable.
  await settings.updateSyncSettings({
    lastSyncTimestamp: transitionAt,
    trackingMode: mode,
    ...(mode === 'health-app'
      ? { healthLookbackStartTimestamp: transitionAt }
      : {}),
    ...(cleanupRequired ? { pedometerCleanupPending: true } : {}),
    ...(mode === 'dual' && previous !== 'dual'
      ? {
          lastHealthReconciledThrough: getDualModeInitialCursor(
            previous,
            transitionAt,
          ),
        }
      : previous === 'dual' && mode !== 'dual'
      ? { lastHealthReconciledThrough: null }
      : {}),
  });
  progress.setLastSyncDate(new Date().toISOString());
  progress.resetSyncStatus();
  progress.clearAllSyncIssues();

  if (usesPedometer(mode)) {
    if (!pedometerService.isSupported()) {
      // iOS today. Persist the preference so the UI can reflect the
      // user's intent, but do not attempt to start anything.
      return { mode, tracking: false };
    }

    const permissions = await pedometerService.requestRuntimePermissions();
    if (!permissions.activityRecognition) {
      return { mode, tracking: false, permissions };
    }

    try {
      const started = await pedometerService.startTracking();
      // Once tracking is actually running, prompt the OS battery-opt
      // allowlist dialog if we're not already exempt. Stock Android Doze
      // will kill our foreground service after ~1 hour otherwise. The
      // native side is a no-op when already allow-listed, and shows the
      // OS-provided prompt directly — no in-app UI required. Failure is
      // logged rather than surfaced: the switch succeeded even if the
      // user denies or the intent can't be resolved.
      if (started) {
        try {
          const env = await pedometerService.getEnvironment();
          if (!env.ignoresBatteryOptimizations) {
            await pedometerService.requestIgnoreBatteryOptimizations();
          }
        } catch (error) {
          console.warn(
            '[trackingModeService] battery-opt prompt failed:',
            error,
          );
        }
      }
      return { mode, tracking: started, permissions };
    } catch (error) {
      console.warn('Failed to start pedometer service:', error);
      return { mode, tracking: false, permissions };
    }
  }

  // Switching to health-app: stop the service if we were previously in
  // pedometer mode. Ignored on iOS (isSupported === false makes stop a
  // no-op, but we still gate to avoid the roundtrip).
  if (cleanupRequired) {
    const cleanupComplete = await completePendingPedometerCleanup();
    return { mode, tracking: !cleanupComplete };
  }

  return { mode, tracking: false };
}

export async function switchTrackingMode(
  mode: TrackingMode,
): Promise<SwitchResult> {
  trackingModeTransitionsInProgress += 1;
  try {
    return await performTrackingModeSwitch(mode);
  } finally {
    trackingModeTransitionsInProgress -= 1;
  }
}

/**
 * Called on app hydrate and whenever the app returns to the foreground.
 * Reconciles the persisted `syncEnabled` flag with the ground truth of
 * what the native pedometer service is actually doing.
 *
 * Cases are driven by two independent signals we can't fake
 * (`env.activityRecognition` + `isServiceRunning()`):
 *
 *   1. Pending or orphaned native cleanup → retry stop before mode checks.
 *   2. Permission positively confirmed missing → force `syncEnabled=false`.
 *      User revoked ACTIVITY_RECOGNITION from system Settings while we
 *      were closed; the service cannot run without it.
 *   3. Permissions ok AND user wants tracking (`syncEnabled=true`) →
 *      make sure the foreground service is actually running (it may
 *      have been killed by a force-stop or a fresh install).
 *   4. Permissions ok AND `syncEnabled=false` but the native service is
 *      running → preserve the persisted user intent and clean up the
 *      orphan. This also repairs failures created before the pending
 *      marker existed.
 *
 * On any native error we deliberately do NOT flip `syncEnabled` in
 * either direction — we can't tell whether permissions are actually
 * missing or the native call just failed transiently, and misfiring
 * either way strands the user's real state.
 *
 * iOS: `isSupported()` short-circuits.
 */
export async function ensureTrackingModeRunning(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (trackingModeTransitionsInProgress > 0) return;
  let settings = useSettingsStore.getState();
  if (!pedometerService.isSupported()) return;
  if (settings.pedometerCleanupPending) {
    const cleanupComplete = await completePendingPedometerCleanup();
    if (!cleanupComplete) return;
    settings = useSettingsStore.getState();
  }

  try {
    if (!usesPedometer(settings.trackingMode)) {
      if (await pedometerService.isServiceRunning()) {
        await settings.updateSyncSettings({
          pedometerCleanupPending: true,
        });
        await completePendingPedometerCleanup();
      }
      return;
    }

    const env = await pedometerService.getEnvironment();
    const progress = useProgressStore.getState();
    if (!env.samplePersistenceHealthy) {
      progress.setSyncStatus({
        phase: 'error',
        chunksDone: 0,
        chunksTotal: 0,
        milesAdded: 0,
        startedAt: null,
        lastProgressAt: null,
        error: {
          kind: 'pedometerStorage',
          message: env.samplePersistenceError ?? 'Native sample write failed',
        },
      });
    } else if (
      progress.syncIssues.some(issue => issue.error.kind === 'pedometerStorage')
    ) {
      progress.resolveSyncIssue('pedometer');
    }

    // Matches the selection-time gate in SyncContentAndroid: both
    // physical-activity AND background-activity (battery-opt allowlist)
    // are required. If either is off we can't reliably keep the FGS
    // alive across Doze, so treat it the same as an outright revoke
    // and refuse to auto-restart.
    const permissionsOk =
      env.activityRecognition &&
      env.hasSensor &&
      env.ignoresBatteryOptimizations;

    if (settings.trackingMode === 'dual') {
      const healthPermission =
        await fitnessService.getHealthConnectPermissionState();
      const permissionOutcome = resolveDualPermissionOutcome(
        permissionsOk,
        healthPermission,
      );

      if (permissionOutcome === 'health-app') {
        await switchTrackingMode('health-app');
        useProgressStore.getState().setSyncStatus({
          phase: 'error',
          chunksDone: 0,
          chunksTotal: 0,
          milesAdded: 0,
          startedAt: null,
          lastProgressAt: null,
          error: {
            kind: 'sourceFallback',
            unavailableSource: 'pedometer',
            activeSource: 'health-app',
          },
        });
        return;
      }

      if (permissionOutcome === 'pedometer') {
        await switchTrackingMode('pedometer');
        await useSettingsStore.getState().updateSyncSettings({
          syncProvider: 'none',
        });
        useProgressStore.getState().setSyncStatus({
          phase: 'error',
          chunksDone: 0,
          chunksTotal: 0,
          milesAdded: 0,
          startedAt: null,
          lastProgressAt: null,
          error: {
            kind: 'sourceFallback',
            unavailableSource: 'health-app',
            activeSource: 'pedometer',
          },
        });
        return;
      }

      if (permissionOutcome === 'none') {
        const current = useSettingsStore.getState();
        await current.updateSyncSettings({
          lastHealthReconciledThrough: null,
          syncProvider: 'none',
          syncEnabled: false,
          pedometerCleanupPending: true,
        });
        await completePendingPedometerCleanup();
        useProgressStore.getState().setSyncStatus({
          phase: 'error',
          chunksDone: 0,
          chunksTotal: 0,
          milesAdded: 0,
          startedAt: null,
          lastProgressAt: null,
          error: {
            kind: 'permission',
            source: 'both',
            message: 'Pedometer and Health Connect permissions were revoked',
          },
        });
        return;
      }
    }

    if (!permissionsOk) {
      const s = useSettingsStore.getState();
      await s.updateSyncSettings({
        lastHealthReconciledThrough: null,
        pedometerCleanupPending: true,
        ...(s.syncEnabled && s.trackingMode === 'pedometer'
          ? { syncEnabled: false }
          : {}),
      });
      // Only surface the permission banner when the user thought they
      // were tracking (syncEnabled=true). If they'd already stopped
      // syncing, permissions being off is expected and doesn't warrant
      // a banner.
      if (s.syncEnabled) {
        if (s.trackingMode === 'dual') {
          await switchTrackingMode('health-app');
        }
        // Pick the most-specific message so the user knows which one
        // to fix. Ordered: sensor > activity-recognition > bg-activity
        // (sensor issues are unfixable by the user; the perms are).
        const message = !env.hasSensor
          ? 'Step counter sensor is unavailable on this device'
          : !env.activityRecognition
          ? 'Physical activity permission was revoked'
          : 'Background activity access was revoked';
        useProgressStore.getState().setSyncStatus({
          phase: 'error',
          chunksDone: 0,
          chunksTotal: 0,
          milesAdded: 0,
          startedAt: null,
          lastProgressAt: null,
          error: {
            kind: 'permission',
            source: 'pedometer',
            message,
          },
        });
      }
      // Full cleanup of native-side artifacts that outlive an OS-driven
      // permission revoke: cancels the WorkManager sweep so it stops
      // firing every ~4h against a permission-less sensor, and clears
      // the `KEY_WAS_TRACKING` SharedPreferences flag so BootReceiver
      // won't try to re-spin the (permission-gated) service after the
      // next device reboot. Idempotent — safe if the service is already
      // dead (which it is, since Android kills the process on revoke).
      await completePendingPedometerCleanup();
      return;
    }

    const running = await pedometerService.isServiceRunning();
    const s = useSettingsStore.getState();

    if (s.syncEnabled) {
      // User has pedometer on. Restart the service if it isn't alive
      // (cold boot, force-stop recovery, fresh install).
      if (!running) {
        await pedometerService.startTracking();
      }

      // Reported only after the restart above, because both of these are
      // retrospective: this pass repairs the condition it is describing. A
      // present-tense "tracking is stopped" would be false by the time the
      // card renders, and a restart failure is not something the user can act
      // on anyway -- the next foreground pass will report it again.
      //
      // Skipped when permissions are missing (handled by the gate above),
      // because then a dead service is a revoke, not a battery manager, and
      // the card would name the wrong cause and the wrong fix.
      const commitHealth = evaluatePedometerCommitHealth({
        trackingMode: settings.trackingMode,
        lastCommitAt: settings.lastSyncTimestamp,
        now: Date.now(),
        serviceRunning: running,
      });
      if (commitHealth.status === 'service-stopped') {
        progress.addSyncIssue({
          kind: 'pedometerServiceStopped',
          lastCommitAt: commitHealth.lastCommitAt,
          staleForMs: commitHealth.staleForMs,
          manufacturer: env.manufacturer || '',
        });
      } else if (
        commitHealth.status === 'ok' &&
        progress.syncIssues.some(
          issue => issue.error.kind === 'pedometerServiceStopped',
        )
      ) {
        progress.resolveSyncIssue('pedometer');
      }
    } else if (running) {
      // Persisted off-state is the user's intent. Mark cleanup before
      // touching native state so a failed stop remains retryable.
      await s.updateSyncSettings({
        pedometerCleanupPending: true,
      });
      await completePendingPedometerCleanup();
    }
    // else: syncEnabled=false and service not running — user really
    // did stop syncing. Do nothing.
  } catch (error) {
    console.warn('ensureTrackingModeRunning failed:', error);
  }
}
