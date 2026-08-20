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

  companion object {
    private const val DATABASE_NAME = "middle_earth_pedometer.db"
    private const val DATABASE_VERSION = 1

    internal const val TABLE = "step_samples"
    internal const val COL_ID = "id"
    internal const val COL_TIMESTAMP = "timestamp_ms"
    internal const val COL_STEPS = "step_count"
    internal const val COL_BOOT_ID = "boot_id"
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
        """
        CREATE TABLE $TABLE (
          $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
          $COL_TIMESTAMP INTEGER NOT NULL,
          $COL_STEPS INTEGER NOT NULL,
          $COL_BOOT_ID TEXT NOT NULL
        )
        """.trimIndent())
    db.execSQL("CREATE INDEX idx_step_samples_ts ON $TABLE($COL_TIMESTAMP)")
    db.execSQL("CREATE INDEX idx_step_samples_boot ON $TABLE($COL_BOOT_ID)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // Schema v1 only; nothing to migrate yet.
  }

  fun insertSample(timestampMs: Long, stepCount: Long, bootId: String) {
    writableDatabase.use { db ->
      val values =
          ContentValues().apply {
            put(COL_TIMESTAMP, timestampMs)
            put(COL_STEPS, stepCount)
            put(COL_BOOT_ID, bootId)
          }
      db.insertOrThrow(TABLE, null, values)
    }
  }

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
}
