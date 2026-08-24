package com.middleearthchallenge.pedometer

import android.app.Application
import android.content.Context
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class StepCounterDbHelperTest {
  private lateinit var context: Context
  private lateinit var helper: StepCounterDbHelper

  @Before
  fun setUp() {
    context = RuntimeEnvironment.getApplication()
    context.deleteDatabase("middle_earth_pedometer.db")
    helper = StepCounterDbHelper(context)
  }

  @After
  fun tearDown() {
    helper.close()
    context.deleteDatabase("middle_earth_pedometer.db")
  }

  @Test
  fun pruneKeepsNewestPreCutoffAnchorForEachBootAndAllNewerSamples() {
    helper.insertSample(timestampMs = 100, stepCount = 1_000, bootId = "boot-a")
    helper.insertSample(timestampMs = 200, stepCount = 1_050, bootId = "boot-a")
    helper.insertSample(timestampMs = 400, stepCount = 1_100, bootId = "boot-a")

    helper.insertSample(timestampMs = 150, stepCount = 200, bootId = "boot-b")
    helper.insertSample(timestampMs = 250, stepCount = 240, bootId = "boot-b")
    helper.insertSample(timestampMs = 450, stepCount = 300, bootId = "boot-b")

    helper.insertSample(timestampMs = 50, stepCount = 10, bootId = "old-boot")
    helper.insertSample(timestampMs = 75, stepCount = 20, bootId = "old-boot")

    assertEquals(3, helper.pruneSamplesBefore(cutoffMs = 300))

    assertEquals(
        listOf(
            Triple("old-boot", 75L, 20L),
            Triple("boot-a", 200L, 1_050L),
            Triple("boot-b", 250L, 240L),
            Triple("boot-a", 400L, 1_100L),
            Triple("boot-b", 450L, 300L),
        ),
        readSamples())
  }

  @Test
  fun retainedAnchorsPreserveStepDeltaAcrossTheCutoff() {
    helper.insertSample(timestampMs = 100, stepCount = 1_000, bootId = "boot-a")
    helper.insertSample(timestampMs = 200, stepCount = 1_050, bootId = "boot-a")
    helper.insertSample(timestampMs = 400, stepCount = 1_100, bootId = "boot-a")

    helper.insertSample(timestampMs = 150, stepCount = 200, bootId = "boot-b")
    helper.insertSample(timestampMs = 250, stepCount = 240, bootId = "boot-b")
    helper.insertSample(timestampMs = 450, stepCount = 300, bootId = "boot-b")

    helper.pruneSamplesBefore(cutoffMs = 300)

    assertEquals(110, helper.readStepsBetween(fromMs = 300, toMs = 500))
  }

  private fun readSamples(): List<Triple<String, Long, Long>> {
    return helper.readableDatabase
        .rawQuery(
            "SELECT boot_id, timestamp_ms, step_count FROM step_samples ORDER BY timestamp_ms",
            null)
        .use { cursor ->
          buildList {
            while (cursor.moveToNext()) {
              add(Triple(cursor.getString(0), cursor.getLong(1), cursor.getLong(2)))
            }
          }
        }
  }
}