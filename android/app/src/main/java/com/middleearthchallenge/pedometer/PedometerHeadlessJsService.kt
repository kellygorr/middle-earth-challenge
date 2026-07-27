package com.middleearthchallenge.pedometer

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Bridges [PedometerBackgroundWorker] (WorkManager-owned) into React
 * Native's Headless JS runtime. Started once per BG sweep — the JS side
 * (`registerHeadlessTask('PedometerSweep', ...)` in index.js) does the
 * actual work of committing a pedometer row for the watermark window
 * and firing any milestone notifications.
 *
 * Deliberately *not* a foreground service: Android 12+ blocks starting
 * foreground services from background contexts (which is where
 * WorkManager runs `doWork`), and we don't need one here because the
 * task itself is short-lived (single native call + one SQLite write +
 * a maybe notification, under a second in practice).
 *
 * `allowedInForeground = true` because WorkManager may fire the sweep
 * while the app is in the foreground — with `false`, RN throws an
 * `IllegalStateException` from `startTask` and the process dies. The
 * sweep is idempotent (watermark-based commit): if the foreground JS
 * has already advanced the watermark via `useSyncInterval`, this run
 * commits a zero-step row for a near-empty window and returns.
 *
 * The 60-second `timeout` cap below is a hard ceiling — if the JS task
 * hangs (e.g. deadlocked on native calls), the RN bridge tears down the
 * service to stop leaking resources. Real work is far below this bound.
 */
class PedometerHeadlessJsService : HeadlessJsTaskService() {

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    return HeadlessJsTaskConfig(
        /* taskKey = */ "PedometerSweep",
        /* data = */ Arguments.createMap(),
        /* timeout = */ 60_000L,
        /* allowedInForeground = */ true,
    )
  }
}
