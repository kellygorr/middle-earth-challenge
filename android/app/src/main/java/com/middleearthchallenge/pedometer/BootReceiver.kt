package com.middleearthchallenge.pedometer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Restarts the pedometer foreground service after device reboot if the
 * user had tracking active before the reboot. Without this, users who
 * chose pedometer mode would have to open the app once after every
 * reboot for step counting to resume — an easy source of "why did my
 * miles stop counting" support reports.
 *
 * Reads the [PedometerPrefs.KEY_WAS_TRACKING] flag written by
 * [PedometerModule.startTracking] / [PedometerModule.stopTracking].
 * We deliberately use `SharedPreferences` rather than our main SQLite
 * settings DB because:
 *
 *  1. It's simpler — no bridge init, no async, no DB migration surface
 *  2. It represents "service state" (running / not) more directly than
 *     "user preference" (mode selection) — a stopped service should
 *     not restart on boot even if the mode is still "pedometer"
 *
 * We only listen for `BOOT_COMPLETED`, not `LOCKED_BOOT_COMPLETED`.
 * The latter fires before user unlock (direct-boot mode) and would
 * require moving prefs to device-protected storage. Users typically
 * unlock within seconds of a reboot, and until they do there's no
 * user-visible surface to show step count anyway.
 *
 * Also re-enqueues the WorkManager periodic worker. WorkManager
 * *should* restore its schedule after boot on its own, but re-enqueue
 * is idempotent (KEEP policy) and cheap insurance against OEM
 * regressions.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

    try {
      val prefs = context.getSharedPreferences(
          PedometerPrefs.FILE_NAME,
          Context.MODE_PRIVATE,
      )
      val wasTracking = prefs.getBoolean(PedometerPrefs.KEY_WAS_TRACKING, false)
      if (!wasTracking) return

      Log.i(TAG, "Boot completed with pedometer tracking active — restarting.")

      // `foregroundServiceType="health"` is set in the manifest, which
      // makes this legal on Android 12+ from a BOOT_COMPLETED receiver.
      val serviceIntent = Intent(context, StepCounterService::class.java)
      ContextCompat.startForegroundService(context, serviceIntent)

      // Belt-and-suspenders: WorkManager restores its own schedule after
      // boot, but enqueueUniquePeriodicWork with KEEP is a no-op if the
      // schedule is already present, so it's safe to call anyway.
      PedometerBackgroundWorker.enqueue(context)
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to restart pedometer service on boot: ${t.message}", t)
    }
  }

  companion object {
    private const val TAG = "PedoBootReceiver"
  }
}

/**
 * Constants for the small on-disk preferences file we use to remember
 * "was pedometer tracking active" across process death / reboot. Kept
 * in its own object rather than [PedometerModule] so [BootReceiver] can
 * reference it without pulling in the RN bridge (receivers run in a
 * minimal context before the JS runtime exists).
 */
internal object PedometerPrefs {
  const val FILE_NAME = "middleearth_pedometer_prefs"
  const val KEY_WAS_TRACKING = "was_tracking"

  fun edit(context: Context): SharedPreferences.Editor {
    return context
        .getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
        .edit()
  }
}
