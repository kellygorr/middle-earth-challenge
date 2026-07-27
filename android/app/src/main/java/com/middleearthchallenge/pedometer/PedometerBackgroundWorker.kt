package com.middleearthchallenge.pedometer

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Periodic WorkManager task that runs the ~5x/day pedometer BG sweep.
 *
 * `doWork` just hands off to [PedometerHeadlessJsService] — that service
 * spins up React Native's Headless JS runtime and runs the
 * `PedometerSweep` JS task, which does the actual commit + optional
 * milestone-notification work. See docs/pedometer-mode.md § Phase 3b.
 *
 * The 4-hour interval below is chosen so that:
 *
 *  - We commit ~6 rows/day (Android schedules can drift), satisfying
 *    the design's "~5x/day" target
 *  - We're comfortably above WorkManager's 15-minute minimum
 *  - OEM battery managers that space workers out further still yield
 *    correct (variable-length) rows because our commit strategy is
 *    watermark-based
 *
 * No network constraint, no charging constraint — the sweep should
 * run whenever it can, subject only to the OS's Doze / App Standby
 * decisions.
 */
class PedometerBackgroundWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {

  override fun doWork(): Result {
    return try {
      val intent = Intent(applicationContext, PedometerHeadlessJsService::class.java)
      // `HeadlessJsTaskService` is NOT a foreground service — starting
      // it from a background-executing Worker is allowed on Android 12+.
      applicationContext.startService(intent)
      Result.success()
    } catch (t: Throwable) {
      // Log but return success: retries would only pile up on a
      // consistently-failing OEM, and the next scheduled tick will
      // recover us. The commit strategy is watermark-based so a missed
      // tick just means a longer-lasting row next time.
      Log.w(TAG, "Failed to launch PedometerHeadlessJsService: ${t.message}", t)
      Result.success()
    }
  }

  companion object {
    private const val TAG = "PedometerBgWorker"
    const val WORK_NAME = "middleearth.pedometer.background.sweep"

    /**
     * Enqueue the periodic worker (idempotent — `KEEP` policy leaves any
     * existing schedule in place). Called from [PedometerModule.startTracking]
     * whenever the user has pedometer mode active and the foreground
     * service is up.
     */
    fun enqueue(context: Context) {
      val constraints = Constraints.Builder().build()
      val request =
          PeriodicWorkRequestBuilder<PedometerBackgroundWorker>(4, TimeUnit.HOURS)
              .setConstraints(constraints)
              .build()
      WorkManager.getInstance(context.applicationContext)
          .enqueueUniquePeriodicWork(
              WORK_NAME,
              ExistingPeriodicWorkPolicy.KEEP,
              request,
          )
    }

    /**
     * Cancel the periodic worker. Called from [PedometerModule.stopTracking]
     * when the user switches back to health-app mode — we don't want to
     * keep pinging JS to commit windows that will always be empty.
     */
    fun cancel(context: Context) {
      WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
    }
  }
}
