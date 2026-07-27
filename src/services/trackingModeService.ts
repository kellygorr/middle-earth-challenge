import { Platform } from 'react-native';
import { TrackingMode } from '../types';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { pedometerService } from './pedometerService';
import { commitPedometerRange } from './pedometerCommit';

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
export async function switchTrackingMode(
  mode: TrackingMode,
): Promise<SwitchResult> {
  const settings = useSettingsStore.getState();
  const progress = useProgressStore.getState();
  const previous = settings.trackingMode;

  // Flush uncommitted pedometer steps BEFORE the watermark is reset
  // below. Skips no-op cases (same mode, or missing watermark). Errors
  // are logged rather than blocking the switch — a failed flush is
  // strictly better than refusing to change modes, and the user can
  // still see everything the service captured before the last 2-min
  // commit.
  if (
    previous === 'pedometer' &&
    mode !== 'pedometer' &&
    pedometerService.isSupported() &&
    settings.lastSyncTimestamp
  ) {
    try {
      await commitPedometerRange(settings.lastSyncTimestamp, Date.now());
    } catch (error) {
      console.warn(
        '[trackingModeService] pre-switch pedometer flush failed:',
        error,
      );
    }
  }

  // Reset per-mode sync bookkeeping so the new mode starts clean.
  // Set lastSyncTimestamp to `now` so the next tick fetches only forward
  // steps / records — never re-ingests history that came from the old
  // source. Users who want backfill can delete progress and re-enable.
  settings.setLastSyncTimestamp(Date.now());
  progress.setLastSyncDate(new Date().toISOString());
  progress.resetSyncStatus();
  progress.clearLastSyncError();

  settings.setTrackingMode(mode);

  if (mode === 'pedometer') {
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
  if (previous === 'pedometer' && pedometerService.isSupported()) {
    try {
      await pedometerService.stopTracking();
    } catch (error) {
      console.warn('Failed to stop pedometer service:', error);
    }
  }

  return { mode, tracking: false };
}

/**
 * Called on app hydrate and whenever the app returns to the foreground.
 * Reconciles the persisted `syncEnabled` flag with the ground truth of
 * what the native pedometer service is actually doing.
 *
 * Three cases, driven by two independent signals we can't fake
 * (`env.activityRecognition` + `isServiceRunning()`):
 *
 *   1. Permission positively confirmed missing → force `syncEnabled=false`.
 *      User revoked ACTIVITY_RECOGNITION from system Settings while we
 *      were closed; the service cannot run without it.
 *   2. Permissions ok AND user wants tracking (`syncEnabled=true`) →
 *      make sure the foreground service is actually running (it may
 *      have been killed by a force-stop or a fresh install).
 *   3. Permissions ok AND `syncEnabled=false` but the native service
 *      IS running (persistent notification visible, WorkManager sweeps
 *      committing rows) → the store drifted off from reality; reconcile
 *      `syncEnabled` back ON. This is the recovery path from an earlier
 *      spurious off-flip.
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
  const settings = useSettingsStore.getState();
  if (settings.trackingMode !== 'pedometer') return;
  if (!pedometerService.isSupported()) return;

  try {
    const env = await pedometerService.getEnvironment();
    const permissionsOk = env.activityRecognition && env.hasSensor;

    if (!permissionsOk) {
      const s = useSettingsStore.getState();
      // Only surface the permission banner when the user thought they
      // were tracking (syncEnabled=true). If they'd already stopped
      // syncing, permissions being off is expected and doesn't warrant
      // a banner.
      if (s.syncEnabled) {
        s.setSyncEnabled(false);
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
            message: env.hasSensor
              ? 'ACTIVITY_RECOGNITION permission was revoked'
              : 'Step counter sensor is unavailable on this device',
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
      try {
        await pedometerService.stopTracking();
      } catch (error) {
        console.warn('ensureTrackingModeRunning: stopTracking failed:', error);
      }
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
    } else if (running) {
      // Store says off but the service is alive — trust the native
      // flag: this is the drift-recovery case. Also make sure
      // syncProvider reflects the pedometer state model.
      s.setSyncEnabled(true);
      if (s.syncProvider !== 'none') {
        s.setSyncProvider('none');
      }
    }
    // else: syncEnabled=false and service not running — user really
    // did stop syncing. Do nothing.
  } catch (error) {
    console.warn('ensureTrackingModeRunning failed:', error);
  }
}
