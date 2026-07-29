package com.middleearthchallenge.pedometer

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.middleearthchallenge.R
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service that keeps the phone's [Sensor.TYPE_STEP_COUNTER]
 * sensor subscription alive while the app is backgrounded / screen off.
 *
 * Persists snapshots of the cumulative step counter to a SQLite database
 * ([StepCounterDbHelper]) so we can later compute steps-in-time-window
 * queries from JS via [PedometerModule.getStepsBetween].
 *
 * Started via `startForegroundService(Intent(ctx, StepCounterService::class))`
 * and stopped via `stopService(intent)` — normally driven from
 * [PedometerModule]. Also survives service-kill via [Service.START_STICKY]
 * so Android restarts us after low-memory kills. Does *not* auto-restart
 * across device reboots; see docs/pedometer-mode.md.
 *
 * Reboots are handled via `bootId` — a UUID we regenerate whenever
 * `System.currentTimeMillis() - SystemClock.elapsedRealtime()` (i.e. the
 * moment the device booted) shifts by more than a small tolerance from
 * the last-recorded boot instant. The DB stores every sample against its
 * bootId so cumulative-counter resets on reboot don't produce spurious
 * negative deltas at query time.
 */
class StepCounterService : Service(), SensorEventListener {

  private lateinit var sensorManager: SensorManager
  private var stepSensor: Sensor? = null
  private lateinit var dbHelper: StepCounterDbHelper

  /** Stable boot correlator; regenerated on boot detection. */
  private var bootId: String = ""

  /** Timestamp of most recent DB write, for throttling. */
  private var lastWriteMs: Long = 0L

  /** Most recently observed cumulative step count for delta shortcut. */
  private var lastCount: Long = -1L

  companion object {
    private const val TAG = "StepCounterService"

    private const val NOTIFICATION_CHANNEL_ID = "middle_earth_pedometer"
    private const val NOTIFICATION_CHANNEL_NAME = "Step tracking"
    private const val NOTIFICATION_ID = 4712

    /** Skip DB write if we already wrote within this many ms. */
    private const val MIN_WRITE_INTERVAL_MS = 10_000L

    /** Skip DB write if step delta since last write is under this. */
    private const val MIN_STEP_DELTA = 5

    /**
     * Boot-instant tolerance. `currentTimeMillis - elapsedRealtime` gives
     * the wall-clock time the device booted; NTP corrections can wobble
     * this by a few seconds, so we treat shifts within this window as
     * "same boot".
     */
    private const val BOOT_INSTANT_TOLERANCE_MS = 60_000L

    private const val PREFS = "middle_earth_pedometer_prefs"
    private const val PREF_BOOT_ID = "boot_id"
    private const val PREF_BOOT_INSTANT_MS = "boot_instant_ms"

    /**
     * Live indicator of whether the service is currently running. Read by
     * [PedometerModule.isServiceRunning] to power the "did the OS silently
     * kill us?" UI in JS.
     */
    val isRunning = AtomicBoolean(false)
  }

  override fun onCreate() {
    super.onCreate()
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    dbHelper = StepCounterDbHelper(applicationContext)
    bootId = resolveBootId()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Permission gate BEFORE foreground promotion: on Android 14+
    // startForeground(type=health) throws SecurityException synchronously
    // if ACTIVITY_RECOGNITION isn't held, which crashes the whole
    // process. This path is hit when the OS auto-restarts our
    // START_STICKY service after killing us for a permission revocation
    // (user revoked Physical activity in system Settings). START_NOT_STICKY
    // so the OS doesn't loop the retry.
    if (ContextCompat.checkSelfPermission(
        this, Manifest.permission.ACTIVITY_RECOGNITION) !=
        PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "ACTIVITY_RECOGNITION not granted; stopping before FGS promotion.")
      stopSelf()
      return START_NOT_STICKY
    }

    // Absent step sensor (rare — mostly emulators or old hardware). Check
    // before promoting to foreground so we don't leave a dead service in
    // the foreground for even a moment.
    val sensor = stepSensor
    if (sensor == null) {
      Log.w(TAG, "TYPE_STEP_COUNTER not present; stopping service.")
      stopSelf()
      return START_NOT_STICKY
    }

    // Foreground promotion — required within a few seconds of
    // startForegroundService or the OS will kill us with an ANR.
    try {
      startInForeground()
    } catch (se: SecurityException) {
      // Extremely narrow race: permission revoked between the check
      // above and startForeground(). Bail cleanly rather than crashing.
      Log.w(TAG, "startForeground threw SecurityException; stopping.", se)
      stopSelf()
      return START_NOT_STICKY
    }

    sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    isRunning.set(true)
    Log.i(TAG, "Step counter listener registered; bootId=$bootId")

    // START_STICKY: if Android kills us for memory, it re-invokes
    // onStartCommand with a null intent when resources allow. Our onCreate
    // handles re-init; sensor re-registers here.
    return START_STICKY
  }

  override fun onDestroy() {
    isRunning.set(false)
    try {
      sensorManager.unregisterListener(this)
    } catch (t: Throwable) {
      Log.w(TAG, "unregisterListener failed", t)
    }
    Log.i(TAG, "Service destroyed")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // ---- SensorEventListener ----

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
    // Sensor returns a single float: cumulative steps since last boot. It's
    // integer-valued but the API is float; cast for storage.
    val count = event.values.firstOrNull()?.toLong() ?: return
    val now = System.currentTimeMillis()

    // Detect a boot we missed (e.g. service restarted post-reboot before
    // our launch listener could re-init bootId).
    val currentBootInstant = now - SystemClock.elapsedRealtime()
    val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val storedBootInstant = prefs.getLong(PREF_BOOT_INSTANT_MS, 0L)
    if (kotlin.math.abs(currentBootInstant - storedBootInstant) >
        BOOT_INSTANT_TOLERANCE_MS) {
      bootId = UUID.randomUUID().toString()
      prefs
          .edit()
          .putString(PREF_BOOT_ID, bootId)
          .putLong(PREF_BOOT_INSTANT_MS, currentBootInstant)
          .apply()
      lastCount = -1L
      Log.i(TAG, "Boot change detected; new bootId=$bootId")
    }

    // Throttle: skip writes if too close in time AND small delta. Prevents
    // hundreds of DB rows during heavy walking bursts while still capturing
    // the shape of the walk (roughly one row every 10s of continuous
    // movement).
    val delta = if (lastCount < 0) MIN_STEP_DELTA.toLong() else count - lastCount
    if (delta < MIN_STEP_DELTA && now - lastWriteMs < MIN_WRITE_INTERVAL_MS) {
      return
    }

    dbHelper.insertSample(now, count, bootId)
    lastCount = count
    lastWriteMs = now
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  // ---- Foreground / notification plumbing ----

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return
    val channel =
        NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW)
            .apply {
              description =
                  "Persistent notification while Middle-earth Challenge counts your steps in the background."
              setShowBadge(false)
              enableVibration(false)
              setSound(null, null)
            }
    nm.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
        .setContentTitle("Middle-earth Challenge")
        .setContentText("Tracking your steps toward Mordor")
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setShowWhen(false)
        .build()
  }

  private fun startInForeground() {
    val notif = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+: must declare the foreground service type explicitly
      // matching the manifest declaration (foregroundServiceType="health").
      startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
    } else {
      startForeground(NOTIFICATION_ID, notif)
    }
  }

  private fun resolveBootId(): String {
    val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val nowInstant = System.currentTimeMillis() - SystemClock.elapsedRealtime()
    val storedInstant = prefs.getLong(PREF_BOOT_INSTANT_MS, 0L)
    val storedId = prefs.getString(PREF_BOOT_ID, null)

    return if (storedId != null &&
        kotlin.math.abs(nowInstant - storedInstant) <= BOOT_INSTANT_TOLERANCE_MS) {
      storedId
    } else {
      val newId = UUID.randomUUID().toString()
      prefs
          .edit()
          .putString(PREF_BOOT_ID, newId)
          .putLong(PREF_BOOT_INSTANT_MS, nowInstant)
          .apply()
      newId
    }
  }
}
