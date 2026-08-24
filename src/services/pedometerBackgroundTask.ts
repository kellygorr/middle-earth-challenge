/**
 * Headless JS task registered as `PedometerSweep` in index.js and
 * invoked directly inside [`PedometerBackgroundWorker`] ~5x/day. See
 * docs/pedometer-mode.md § Phase 3b.
 *
 * The task's job is to commit a single pedometer `DistanceEntry` for
 * the watermark window `[lastSyncTimestamp, now]`, then advance the
 * watermark. This is the *only* mechanism keeping distance data flowing
 * while the user has the app closed.
 *
 * Headless JS runs in a stripped RN context: no components mount, no
 * `App.tsx` init effect fires. We therefore have to hydrate the JS-side
 * state from SQLite ourselves before calling `commitPedometerRange`,
 * otherwise `persistMilesSnapshot` would write the current (empty)
 * store total back to disk, wiping the miles snapshot.
 *
 * Milestone notifications (Phase 3c) are fired from within
 * `commitPedometerRange` via `checkAndFireMilestones`, so any
 * checkpoint crossings inside the background-sweep window are
 * announced without extra plumbing here.
 */

import { database } from './database';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { pedometerService } from './pedometerService';
import { commitPedometerRange } from './pedometerCommit';

/**
 * The registered task entry point. Signature matches RN's
 * `AppRegistry.registerHeadlessTask(name, () => task)` contract:
 * receives a data object (unused for us; passed via `Arguments.createMap()`
 * from the Kotlin side), returns a promise that resolves when the JS
 * work is done. The native service tears down once we resolve.
 */
export async function pedometerBackgroundTask(): Promise<void> {
  try {
    // 1. Bring SQLite up. Reusing the same singleton `database` module
    //    means our stores' `loadSettings` / `initFromDatabase` calls
    //    below will hit a ready connection.
    await database.init();

    // 2. Hydrate settings so `switch on trackingMode` and the watermark
    //    read reflect what the app was last configured with.
    await useSettingsStore.getState().loadSettings();
    const settings = useSettingsStore.getState();

    // Sanity check: if pedometer mode is no longer active, the worker
    // is scheduled to be cancelled but may fire once more before the
    // cancellation propagates. Bail rather than committing a spurious
    // row against whatever mode the user has now.
    if (
      settings.trackingMode !== 'pedometer' &&
      settings.trackingMode !== 'dual'
    ) {
      return;
    }

    if (!pedometerService.isSupported()) {
      return;
    }

    // 3. Hydrate progress so `commitPedometerRange` can compute a
    //    correct new miles total (sum of existing entries + the row
    //    we're about to add) and persist it without clobbering.
    await useProgressStore.getState().initFromDatabase();

    // 4. Service-alive check. If the foreground service was killed
    //    (OEM battery saver, force stop), we won't have any samples
    //    for the window regardless — bail rather than materializing a
    //    zero-step row. The next foreground launch will surface the
    //    `pedometerStopped` error to the user.
    let running = false;
    try {
      running = await pedometerService.isServiceRunning();
    } catch {
      running = false;
    }
    if (!running) {
      return;
    }

    // 5. Commit the watermark window.
    const now = Date.now();
    const watermark = settings.lastSyncTimestamp ?? now;
    if (now <= watermark) {
      // No time has elapsed since the last commit (unusual — WorkManager
      // schedules ~4h apart), nothing to do.
      return;
    }

    try {
      await commitPedometerRange(watermark, now);
    } catch (error) {
      console.warn(
        '[pedometerBackgroundTask] commitPedometerRange failed:',
        error,
      );
      // Do NOT advance the watermark on read failure — next tick will
      // retry the same window.
      return;
    }

    // Note: milestone notifications (Phase 3c) are fired from inside
    // `commitPedometerRange` when miles crosses a checkpoint boundary.
    // No extra plumbing needed here.
  } catch (error) {
    console.error('[pedometerBackgroundTask] fatal error:', error);
    // Swallow — Worker returns Result.success() regardless (see Kotlin
    // side). A pathological failure here just means a longer-window
    // row on the next tick.
  }
}
