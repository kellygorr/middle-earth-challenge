package com.middleearthchallenge.pedometer

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.middleearthchallenge.R

/**
 * React Native native module exposing the pedometer / step-counter service
 * to JS. Handles:
 *
 *  - starting / stopping the foreground [StepCounterService]
 *  - reporting whether the service is currently running (soft-fail
 *    detection — see docs/pedometer-mode.md § Phase 5a)
 *  - reporting permission state for ACTIVITY_RECOGNITION and
 *    POST_NOTIFICATIONS (JS drives the runtime request via the standard
 *    RN Permissions module; we just report state here)
 *  - querying accumulated step counts from the on-device SQLite store
 *  - launching the appropriate OS settings screen so users can allowlist
 *    us from stock Android battery optimization or OEM-specific "put app
 *    to sleep" screens
 *
 * All heavy work runs on background threads implicitly (SQLite reads/
 * writes are cheap and rare; sensor delivery happens on the service's
 * looper). Methods here are simple dispatchers.
 */
class PedometerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  companion object {
    const val MODULE_NAME = "PedometerModule"

    /**
     * Notification channel for journey-milestone alerts (e.g. "You
     * reached Bree!"). Distinct from the foreground-service channel so
     * users can silence "step tracking" without also silencing
     * milestones, and vice-versa. IMPORTANCE_DEFAULT so it makes sound
     * and pops a heads-up on lockscreen.
     */
    const val MILESTONE_CHANNEL_ID = "middle_earth_milestones"
    const val MILESTONE_CHANNEL_NAME = "Journey milestones"

    /**
     * Base notification id for milestone posts. We add the checkpoint
     * index so each checkpoint gets a distinct id (allowing them to
     * stack in the shade rather than replacing one another).
     */
    const val MILESTONE_NOTIFICATION_ID_BASE = 5000
  }

  private val dbHelper by lazy { StepCounterDbHelper(reactContext.applicationContext) }

  // ---- Service lifecycle ----

  @ReactMethod
  fun startTracking(promise: Promise) {
    try {
      if (!hasActivityRecognition()) {
        promise.reject(
            "E_PERMISSION_ACTIVITY_RECOGNITION",
            "ACTIVITY_RECOGNITION permission not granted")
        return
      }
      if (!hasStepCounterSensor()) {
        promise.reject("E_NO_SENSOR", "TYPE_STEP_COUNTER sensor not present on this device")
        return
      }
      val intent = Intent(reactContext, StepCounterService::class.java)
      ContextCompat.startForegroundService(reactContext, intent)
      // Schedule the ~5x/day background sweep alongside the live
      // foreground service. Idempotent (KEEP policy) so repeated
      // startTracking calls don't reset the schedule.
      PedometerBackgroundWorker.enqueue(reactContext)
      // Remember that we're tracking so BootReceiver can restart us
      // after device reboot. Written before startService returns so
      // the flag reflects the caller's intent even if service startup
      // races with an immediate reboot.
      PedometerPrefs.edit(reactContext)
          .putBoolean(PedometerPrefs.KEY_WAS_TRACKING, true)
          .apply()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_START_FAILED", t.message, t)
    }
  }

  @ReactMethod
  fun stopTracking(promise: Promise) {
    try {
      val intent = Intent(reactContext, StepCounterService::class.java)
      reactContext.stopService(intent)
      // Cancel the BG sweep — a mode switch or explicit stop means we
      // no longer want to be woken up to commit pedometer windows.
      PedometerBackgroundWorker.cancel(reactContext)
      // Clear the boot-resume flag so BootReceiver doesn't revive us.
      PedometerPrefs.edit(reactContext)
          .putBoolean(PedometerPrefs.KEY_WAS_TRACKING, false)
          .apply()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_STOP_FAILED", t.message, t)
    }
  }

  @ReactMethod
  fun isServiceRunning(promise: Promise) {
    // AtomicBoolean set by the service in onStartCommand / onDestroy.
    // Reflects reality even when the OS killed us silently, since the
    // process would have been torn down and this static would reset to
    // false on next module init.
    promise.resolve(StepCounterService.isRunning.get())
  }

  // ---- Query ----

  /**
   * Reads step counts accumulated in [fromMs, toMs]. Returns
   * `{ steps: number, fromMs: number, toMs: number }`. Handles boot
   * boundaries at the DB layer; see [StepCounterDbHelper.readStepsBetween].
   */
  @ReactMethod
  fun getStepsBetween(fromMs: Double, toMs: Double, promise: Promise) {
    try {
      val steps = dbHelper.readStepsBetween(fromMs.toLong(), toMs.toLong())
      val out: WritableMap =
          Arguments.createMap().apply {
            putDouble("steps", steps.toDouble())
            putDouble("fromMs", fromMs)
            putDouble("toMs", toMs)
          }
      promise.resolve(out)
    } catch (t: Throwable) {
      promise.reject("E_QUERY_FAILED", t.message, t)
    }
  }

  /**
   * Deletes raw samples older than [cutoffMs], keeping each boot's anchor.
   * Callers pass a cutoff safely behind the commit watermark; see
   * [StepCounterDbHelper.pruneSamplesBefore]. Resolves the rows deleted.
   */
  @ReactMethod
  fun pruneSamplesBefore(cutoffMs: Double, promise: Promise) {
    try {
      promise.resolve(dbHelper.pruneSamplesBefore(cutoffMs.toLong()))
    } catch (t: Throwable) {
      promise.reject("E_PRUNE_FAILED", t.message, t)
    }
  }

  // ---- Permissions & environment ----
  /**
   * Snapshot of everything JS needs to decide what UI to show:
   *
   *   { activityRecognition: boolean,
   *     postNotifications:   boolean,   // on <33, always true
   *     hasSensor:           boolean,
   *     ignoresBatteryOptimizations: boolean,
  *     samplePersistenceHealthy: boolean,
  *     samplePersistenceError: string | null,
  *     samplePersistenceErrorAtMs: number,
   *     manufacturer:        string,
   *     sdkInt:              number }
   */
  @ReactMethod
  fun getEnvironment(promise: Promise) {
    try {
      val out: WritableMap =
          Arguments.createMap().apply {
            putBoolean("activityRecognition", hasActivityRecognition())
            putBoolean("postNotifications", hasPostNotifications())
            putBoolean("hasSensor", hasStepCounterSensor())
            putBoolean("ignoresBatteryOptimizations", ignoresBatteryOptimizations())
            putBoolean(
              "samplePersistenceHealthy",
              StepCounterService.samplePersistenceError.get() == null)
            putString(
              "samplePersistenceError", StepCounterService.samplePersistenceError.get())
            putDouble(
              "samplePersistenceErrorAtMs",
              StepCounterService.samplePersistenceErrorAtMs.get().toDouble())
            putString("manufacturer", Build.MANUFACTURER ?: "")
            putInt("sdkInt", Build.VERSION.SDK_INT)
          }
      promise.resolve(out)
    } catch (t: Throwable) {
      promise.reject("E_ENV_FAILED", t.message, t)
    }
  }

  /**
   * Opens the system prompt asking the user to exclude us from stock
   * Android battery optimization. On approval, the OS grants
   * `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` for us; foreground services
   * survive Doze indefinitely after that (though OEM-specific kill lists
   * still apply — see [openOemBatterySettings]).
   */
  @SuppressLint("BatteryLife") // We are a legitimate use case (health tracking).
  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (ignoresBatteryOptimizations()) {
        promise.resolve(true)
        return
      }
      val intent =
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${reactContext.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_BATTERY_OPT_FAILED", t.message, t)
    }
  }

  /**
   * Best-effort deep link into the OEM-specific "put app to sleep" /
   * background-restrictions screen. On unknown OEMs we fall back to the
   * generic app-info page. On some devices even the OEM-specific intents
   * are removed by locked-down ROMs; the fallback ensures we always land
   * somewhere useful.
   */
  @ReactMethod
  fun openOemBatterySettings(promise: Promise) {
    try {
      val manufacturer = (Build.MANUFACTURER ?: "").lowercase()
      val intents: List<Intent> =
          when {
            manufacturer.contains("samsung") ->
                listOf(
                    // Samsung "Device care" battery screen
                    Intent().setClassName(
                        "com.samsung.android.lool",
                        "com.samsung.android.sm.ui.battery.BatteryActivity"))
            manufacturer.contains("xiaomi") ->
                listOf(
                    Intent().setClassName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"))
            manufacturer.contains("oppo") || manufacturer.contains("realme") ->
                listOf(
                    Intent().setClassName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.StartupAppListActivity"))
            manufacturer.contains("oneplus") ->
                listOf(
                    Intent().setClassName(
                        "com.oneplus.security",
                        "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"))
            manufacturer.contains("huawei") ->
                listOf(
                    Intent().setClassName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
            manufacturer.contains("vivo") ->
                listOf(
                    Intent().setClassName(
                        "com.vivo.permissionmanager",
                        "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"))
            else -> emptyList()
          }

      val fallback =
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${reactContext.packageName}")
          }

      val toTry = intents + fallback
      for (intent in toTry) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          reactContext.startActivity(intent)
          promise.resolve(true)
          return
        } catch (_: Throwable) {
          // Try next candidate.
        }
      }
      promise.reject("E_NO_SETTINGS_TARGET", "No settings activity resolved")
    } catch (t: Throwable) {
      promise.reject("E_OEM_SETTINGS_FAILED", t.message, t)
    }
  }

  // ---- Milestone notifications ----

  /**
   * Posts a heads-up notification celebrating a journey milestone
   * (e.g. reaching a checkpoint). Called from JS after a pedometer
   * commit determines that `miles` crossed a checkpoint boundary.
   *
   * `checkpointIndex` distinguishes concurrent milestones so the OS
   * stacks them in the shade rather than replacing one another when a
   * single commit crosses multiple checkpoints (rare — only after long
   * background gaps).
   *
   * Silently no-ops if POST_NOTIFICATIONS is not granted; the JS side
   * treats the resolve() as success regardless so a missing permission
   * doesn't break the commit path.
   */
  @ReactMethod
  fun fireMilestoneNotification(
      title: String,
      body: String,
      checkpointIndex: Int,
      promise: Promise
  ) {
    try {
      if (!hasPostNotifications()) {
        promise.resolve(false)
        return
      }
      createMilestoneChannelIfNeeded()

      // Tap → launch the app. Reuses the launcher intent so we don't
      // need a hard reference to MainActivity's class here.
      val launchIntent =
          reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
      val pendingFlags =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          else PendingIntent.FLAG_UPDATE_CURRENT
      val contentIntent =
          if (launchIntent != null)
              PendingIntent.getActivity(
                  reactContext,
                  MILESTONE_NOTIFICATION_ID_BASE + checkpointIndex,
                  launchIntent,
                  pendingFlags)
          else null

      val notif =
          NotificationCompat.Builder(reactContext, MILESTONE_CHANNEL_ID)
              .setContentTitle(title)
              .setContentText(body)
              .setStyle(NotificationCompat.BigTextStyle().bigText(body))
              .setSmallIcon(R.mipmap.ic_launcher)
              .setAutoCancel(true)
              .setPriority(NotificationCompat.PRIORITY_DEFAULT)
              .setCategory(NotificationCompat.CATEGORY_REMINDER)
              .apply { if (contentIntent != null) setContentIntent(contentIntent) }
              .build()

      NotificationManagerCompat.from(reactContext)
          .notify(MILESTONE_NOTIFICATION_ID_BASE + checkpointIndex, notif)
      promise.resolve(true)
    } catch (t: Throwable) {
      // Never let a notification failure propagate up and derail the
      // commit path — treat it as best-effort.
      promise.resolve(false)
    }
  }

  private fun createMilestoneChannelIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = reactContext.getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(MILESTONE_CHANNEL_ID) != null) return
    val channel =
        NotificationChannel(
                MILESTONE_CHANNEL_ID,
                MILESTONE_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT)
            .apply {
              description = "Alerts when you reach a new checkpoint on the journey."
              setShowBadge(true)
              enableVibration(true)
            }
    nm.createNotificationChannel(channel)
  }

  // ---- Internal helpers ----

  private fun hasActivityRecognition(): Boolean {
    // Only meaningful on API 29+; earlier versions don't require it.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
        reactContext, Manifest.permission.ACTIVITY_RECOGNITION) ==
        PackageManager.PERMISSION_GRANTED
  }

  private fun hasPostNotifications(): Boolean {
    // Only meaningful on API 33+; earlier versions grant implicitly.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return NotificationManagerCompat.from(reactContext).areNotificationsEnabled()
  }

  private fun hasStepCounterSensor(): Boolean {
    val sm = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    return sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
  }

  private fun ignoresBatteryOptimizations(): Boolean {
    val pm =
        reactContext.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
            ?: return false
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }
}
