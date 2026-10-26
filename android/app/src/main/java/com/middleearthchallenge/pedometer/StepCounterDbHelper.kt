package com.middleearthchallenge.pedometer

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * SQLite helper for pedometer step samples.
 *
 * Schema is intentionally tiny: each row is one snapshot of the phone's
 * cumulative step counter (`TYPE_STEP_COUNTER`, which resets only on
 * reboot) at a moment in time.
 *
 *   step_samples
 *     id           INTEGER PRIMARY KEY AUTOINCREMENT
 *     timestamp_ms INTEGER NOT NULL   -- Wall-clock time of the sample
 *     step_count   INTEGER NOT NULL   -- Cumulative steps since last reboot
 *     boot_id      TEXT NOT NULL      -- Correlates samples within a boot
 *
 * Query pattern: to compute steps in [from, to], find the earliest sample
 * with timestamp >= from and the latest sample with timestamp <= to that
 * share the same boot_id, and subtract. If a reboot happened inside the
 * window, we split at the boot boundary and sum. See [readStepsBetween].
 */
class StepCounterDbHelper(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

  data class SampleCursor(
    val sampleId: Long,
    val timestampMs: Long,
      val elapsedRealtimeMs: Long?,
    val stepCount: Long,
    val bootId: String,
  )

  data class CursorSteps(
    val steps: Long,
    val latestCursor: SampleCursor?,
    val wallClockMovedBackward: Boolean,
  )

  companion object {
    private const val DATABASE_NAME = "middle_earth_pedometer.db"
    private const val DATABASE_VERSION = 2
    private const val CLOCK_SHIFT_TOLERANCE_MS = 60_000L

    internal const val TABLE = "step_samples"
    internal const val COL_ID = "id"
    internal const val COL_TIMESTAMP = "timestamp_ms"
    internal const val COL_ELAPSED_REALTIME = "elapsed_realtime_ms"
    internal const val COL_STEPS = "step_count"
    internal const val COL_BOOT_ID = "boot_id"
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE $TABLE (
          $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
          $COL_TIMESTAMP INTEGER NOT NULL,
          $COL_ELAPSED_REALTIME INTEGER,
          $COL_STEPS INTEGER NOT NULL,
          $COL_BOOT_ID TEXT NOT NULL
        )
        """.trimIndent())
    db.execSQL("CREATE INDEX idx_step_samples_ts ON $TABLE($COL_TIMESTAMP)")
    db.execSQL("CREATE INDEX idx_step_samples_boot ON $TABLE($COL_BOOT_ID)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE $TABLE ADD COLUMN $COL_ELAPSED_REALTIME INTEGER")
    }
  }

  fun insertSample(
      timestampMs: Long,
      stepCount: Long,
      bootId: String,
      elapsedRealtimeMs: Long? = null,
  ) {
    writableDatabase.use { db ->
      val values =
          ContentValues().apply {
            put(COL_TIMESTAMP, timestampMs)
            if (elapsedRealtimeMs != null) put(COL_ELAPSED_REALTIME, elapsedRealtimeMs)
            put(COL_STEPS, stepCount)
            put(COL_BOOT_ID, bootId)
          }
      db.insertOrThrow(TABLE, null, values)
    }
  }

  fun latestSampleCursorAtOrBefore(timestampMs: Long): SampleCursor? {
    readableDatabase.use { db ->
      return db.rawQuery(
              "SELECT $COL_ID, $COL_TIMESTAMP, $COL_ELAPSED_REALTIME, $COL_STEPS, $COL_BOOT_ID FROM $TABLE WHERE $COL_TIMESTAMP <= ? ORDER BY $COL_ID DESC LIMIT 1",
              arrayOf(timestampMs.toString()))
          .use { cursor -> if (cursor.moveToNext()) cursor.toSampleCursor() else null }
    }
  }

  /**
   * Reads samples in insertion order after a durable cursor. Row ids are
   * monotonic within this database, so wall-clock corrections cannot hide
   * samples. The supplied boot/count fields preserve the starting anchor even
   * if pruning has removed the cursor row itself.
   */
  fun readStepsSinceCursor(
      sampleId: Long,
      bootId: String,
      stepCount: Long,
      timestampMs: Long? = null,
      elapsedRealtimeMs: Long? = null,
  ): CursorSteps {
    var total = 0L
    var previousBootId = bootId
    var previousStepCount = stepCount
    var previousTimestamp = timestampMs ?: timestampForSample(sampleId)
    var previousElapsedRealtime = elapsedRealtimeMs ?: elapsedRealtimeForSample(sampleId)
    var latestCursor: SampleCursor? = null
    var wallClockMovedBackward = false

    readableDatabase.use { db ->
      db.rawQuery(
              "SELECT $COL_ID, $COL_TIMESTAMP, $COL_ELAPSED_REALTIME, $COL_STEPS, $COL_BOOT_ID FROM $TABLE WHERE $COL_ID > ? ORDER BY $COL_ID ASC",
              arrayOf(sampleId.toString()))
          .use { cursor ->
            while (cursor.moveToNext()) {
              val sample = cursor.toSampleCursor()
              if (sample.bootId == previousBootId) {
                val delta = sample.stepCount - previousStepCount
                if (delta > 0) total += delta
                val priorTimestamp = previousTimestamp
                val priorElapsedRealtime = previousElapsedRealtime
                if (priorTimestamp != null &&
                    priorElapsedRealtime != null &&
                    sample.elapsedRealtimeMs != null) {
                  val wallDelta = sample.timestampMs - priorTimestamp
                  val elapsedDelta = sample.elapsedRealtimeMs - priorElapsedRealtime
                  if (kotlin.math.abs(wallDelta - elapsedDelta) > CLOCK_SHIFT_TOLERANCE_MS) {
                    wallClockMovedBackward = wallDelta < elapsedDelta
                  }
                }
              }
              previousBootId = sample.bootId
              previousStepCount = sample.stepCount
              previousTimestamp = sample.timestampMs
              previousElapsedRealtime = sample.elapsedRealtimeMs
              latestCursor = sample
            }
          }
    }

    return CursorSteps(total, latestCursor, wallClockMovedBackward)
  }

  private fun timestampForSample(sampleId: Long): Long? {
    readableDatabase.use { db ->
      return db.rawQuery(
              "SELECT $COL_TIMESTAMP FROM $TABLE WHERE $COL_ID = ? LIMIT 1",
              arrayOf(sampleId.toString()))
          .use { cursor -> if (cursor.moveToNext()) cursor.getLong(0) else null }
    }
  }

  private fun elapsedRealtimeForSample(sampleId: Long): Long? {
    readableDatabase.use { db ->
      return db.rawQuery(
              "SELECT $COL_ELAPSED_REALTIME FROM $TABLE WHERE $COL_ID = ? LIMIT 1",
              arrayOf(sampleId.toString()))
          .use { cursor ->
            if (cursor.moveToNext() && !cursor.isNull(0)) cursor.getLong(0) else null
          }
    }
  }

  private fun android.database.Cursor.toSampleCursor() =
      SampleCursor(
          sampleId = getLong(0),
          timestampMs = getLong(1),
          elapsedRealtimeMs = if (isNull(2)) null else getLong(2),
          stepCount = getLong(3),
          bootId = getString(4),
      )

  /**
   * Sum steps taken across [fromMs, toMs].
   *
   * Handles reboots by grouping samples by boot_id and computing (max -
   * min) within each boot's slice of the window, then summing across
   * boots. Samples strictly outside the window are ignored except that we
   * pull the last sample before `fromMs` for each boot to anchor the
   * starting count (so a walk that started before the window still
   * contributes only its in-window portion).
   */
  fun readStepsBetween(fromMs: Long, toMs: Long): Long {
    if (toMs <= fromMs) return 0
    var total = 0L

    readableDatabase.use { db ->
      // Distinct boot_ids that have any samples in the window.
      val boots = mutableListOf<String>()
      db.rawQuery(
              "SELECT DISTINCT $COL_BOOT_ID FROM $TABLE WHERE $COL_TIMESTAMP >= ? AND $COL_TIMESTAMP <= ?",
              arrayOf(fromMs.toString(), toMs.toString()))
          .use { cursor ->
            while (cursor.moveToNext()) {
              boots.add(cursor.getString(0))
            }
          }

      for (bootId in boots) {
        // Anchor: last sample at/before fromMs within this boot (may be null,
        // meaning the window's left edge falls before any recorded sample for
        // this boot).
        val anchor: Long =
            db.rawQuery(
                    "SELECT $COL_STEPS FROM $TABLE WHERE $COL_BOOT_ID = ? AND $COL_TIMESTAMP <= ? ORDER BY $COL_TIMESTAMP DESC LIMIT 1",
                    arrayOf(bootId, fromMs.toString()))
                .use { c -> if (c.moveToNext()) c.getLong(0) else -1L }

        // Latest sample at or before toMs within this boot.
        val end: Long =
            db.rawQuery(
                    "SELECT $COL_STEPS FROM $TABLE WHERE $COL_BOOT_ID = ? AND $COL_TIMESTAMP <= ? ORDER BY $COL_TIMESTAMP DESC LIMIT 1",
                    arrayOf(bootId, toMs.toString()))
                .use { c -> if (c.moveToNext()) c.getLong(0) else -1L }

        if (end < 0) continue

        val start =
            if (anchor >= 0) anchor
            else
                // No anchor — use the earliest sample >= fromMs as start.
                db.rawQuery(
                        "SELECT $COL_STEPS FROM $TABLE WHERE $COL_BOOT_ID = ? AND $COL_TIMESTAMP >= ? ORDER BY $COL_TIMESTAMP ASC LIMIT 1",
                        arrayOf(bootId, fromMs.toString()))
                    .use { c -> if (c.moveToNext()) c.getLong(0) else end }

        val delta = end - start
        if (delta > 0) total += delta
      }
    }

    return total
  }

  /**
   * Delete samples older than [cutoffMs].
   *
   * Keeps the newest sample before the cutoff for each boot, because
   * [readStepsBetween] anchors a window's starting count on that row; dropping
   * it would make the first window after the cutoff report every step taken
   * since boot.
   *
   * Returns the number of rows deleted.
   */
  fun pruneSamplesBefore(cutoffMs: Long): Int {
    var deleted = 0
    writableDatabase.use { db ->
      db.beginTransaction()
      try {
        deleted =
            db.delete(
                TABLE,
                """
                $COL_TIMESTAMP < ?
                  AND $COL_ID NOT IN (
                    SELECT t1.$COL_ID FROM $TABLE t1
                    WHERE t1.$COL_TIMESTAMP < ?
                      AND t1.$COL_TIMESTAMP = (
                        SELECT MAX(t2.$COL_TIMESTAMP) FROM $TABLE t2
                        WHERE t2.$COL_BOOT_ID = t1.$COL_BOOT_ID
                          AND t2.$COL_TIMESTAMP < ?
                      )
                  )
                """.trimIndent(),
                arrayOf(cutoffMs.toString(), cutoffMs.toString(), cutoffMs.toString()))
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
    }
    return deleted
  }
}
