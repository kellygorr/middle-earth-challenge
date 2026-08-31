package com.middleearthchallenge.pedometer

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.TimeUnit
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

/**
 * Periodic WorkManager task that runs the ~5x/day pedometer BG sweep.
 *
 * WorkManager owns the full lifetime of the `PedometerSweep` Headless JS task.
 * Starting a separate service from a background Worker is subject to Android's
 * background-service restrictions, and returning before JS finishes falsely
 * reports successful work. This Worker starts the task through React Native's
 * public task context and suspends until its promise settles.
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
    CoroutineWorker(context, params) {

  override suspend fun doWork(): Result {
    if (!StepCounterService.isRunning.get()) {
      // No native samples are being recorded, so there is nothing safe to
      // commit. Foreground reconciliation reports the stopped service.
      return Result.success()
    }

    val requestId = UUID.randomUUID().toString()
    val reportedResult = PedometerBackgroundTaskResults.register(requestId)

    return try {
      val outcome =
          withTimeout(TASK_TIMEOUT_MS) {
            runHeadlessTask(requestId)
            reportedResult.await()
          }
      workResultFor(outcome)
    } catch (t: TimeoutCancellationException) {
      Log.w(TAG, "PedometerSweep timed out", t)
      Result.retry()
    } catch (t: CancellationException) {
      throw t
    } catch (t: Throwable) {
      Log.w(TAG, "PedometerSweep did not complete: ${t.message}", t)
      Result.retry()
    } finally {
      PedometerBackgroundTaskResults.remove(requestId, reportedResult)
    }
  }

  private suspend fun runHeadlessTask(requestId: String): Unit =
      suspendCancellableCoroutine { continuation ->
        val application = applicationContext.applicationContext as? ReactApplication
        if (application == null) {
          continuation.resumeWithException(
              IllegalStateException("Application does not implement ReactApplication"))
          return@suspendCancellableCoroutine
        }

        val reactHost =
            checkNotNull(application.reactHost) {
              "ReactHost is not initialized"
            }
        var instanceListener: ReactInstanceEventListener? = null
        var taskContext: HeadlessJsTaskContext? = null
        var taskListener: HeadlessJsTaskEventListener? = null
        var taskId: Int? = null

        fun cleanUp(finishTask: Boolean) {
          instanceListener?.let { listener ->
            reactHost.removeReactInstanceEventListener(listener)
          }
          val context = taskContext
          val listener = taskListener
          if (context != null && listener != null) {
            context.removeTaskEventListener(listener)
          }
          if (finishTask) {
            taskId?.let { id ->
              if (context?.isTaskRunning(id) == true) context.finishTask(id)
            }
          }
        }

        fun startTask(reactContext: ReactContext) {
          try {
            val context = HeadlessJsTaskContext.getInstance(reactContext)
            val listener =
                object : HeadlessJsTaskEventListener {
                  override fun onHeadlessJsTaskStart(startedTaskId: Int) = Unit

                  override fun onHeadlessJsTaskFinish(finishedTaskId: Int) {
                    if (finishedTaskId != taskId) return
                    cleanUp(finishTask = false)
                    if (continuation.isActive) continuation.resume(Unit)
                  }
                }
            taskContext = context
            taskListener = listener
            context.addTaskEventListener(listener)
            taskId =
                context.startTask(
                    HeadlessJsTaskConfig(
                        TASK_NAME,
                        Arguments.createMap().apply { putString("requestId", requestId) },
                        0L,
                        true,
                    ))
          } catch (t: Throwable) {
            cleanUp(finishTask = true)
            if (continuation.isActive) continuation.resumeWithException(t)
          }
        }

        UiThreadUtil.runOnUiThread {
          val currentContext = reactHost.currentReactContext
          if (currentContext != null) {
            startTask(currentContext)
          } else {
            val listener =
                object : ReactInstanceEventListener {
                  override fun onReactContextInitialized(context: ReactContext) {
                    reactHost.removeReactInstanceEventListener(this)
                    instanceListener = null
                    startTask(context)
                  }
                }
            instanceListener = listener
            reactHost.addReactInstanceEventListener(listener)
            reactHost.start()
          }
        }

        continuation.invokeOnCancellation {
          UiThreadUtil.runOnUiThread { cleanUp(finishTask = true) }
        }
      }

  companion object {
    private const val TAG = "PedometerBgWorker"
    private const val TASK_NAME = "PedometerSweep"
    private const val TASK_TIMEOUT_MS = 60_000L
    const val WORK_NAME = "middleearth.pedometer.background.sweep"

    internal fun workResultFor(outcome: PedometerBackgroundTaskOutcome): Result =
        when (outcome) {
          PedometerBackgroundTaskOutcome.SUCCESS -> Result.success()
          PedometerBackgroundTaskOutcome.RETRY -> Result.retry()
        }

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
