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
import {
  pedometerService,
  reportPedometerBackgroundTaskResult,
} from './pedometerService';
import { commitPedometerRange } from './pedometerCommit';

interface PedometerBackgroundTaskData {
  requestId: string;
}

/**
 * The registered task entry point. Signature matches RN's
 * `AppRegistry.registerHeadlessTask(name, () => task)` contract:
 * receives a request ID from the Worker and reports whether WorkManager
 * should treat the completed task as success or retry. A missing report
 * times out on the native side and is conservatively retried.
 */
export async function pedometerBackgroundTask({
  requestId,
}: PedometerBackgroundTaskData): Promise<void> {
  let succeeded = true;

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
    const running = await pedometerService.isServiceRunning();
    if (!running) {
      return;
    }

    // 5. Commit the watermark window.
    const now = Date.now();
    const watermark = settings.lastSyncTimestamp ?? now;
    if (now === watermark) {
      // No time has elapsed since the last commit (unusual — WorkManager
      // schedules ~4h apart), nothing to do.
      return;
    }

    await commitPedometerRange(watermark, now);

    // Note: milestone notifications (Phase 3c) are fired from inside
    // `commitPedometerRange` when miles crosses a checkpoint boundary.
    // No extra plumbing needed here.
  } catch (error) {
    succeeded = false;
    console.error('[pedometerBackgroundTask] fatal error:', error);
  } finally {
    reportPedometerBackgroundTaskResult(requestId, succeeded);
  }
}
