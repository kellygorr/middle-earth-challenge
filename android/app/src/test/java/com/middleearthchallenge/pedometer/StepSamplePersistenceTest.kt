package com.middleearthchallenge.pedometer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class StepSamplePersistenceTest {
  @Test
  fun failedWriteDoesNotAdvanceThrottleState() {
    val persistence = StepSamplePersistence(minStepDelta = 5, minWriteIntervalMs = 10_000)
    var attempts = 0

    assertThrows(IllegalStateException::class.java) {
      persistence.persistIfDue(count = 100, now = 20_000) {
        attempts += 1
        throw IllegalStateException("disk full")
      }
    }

    val retried =
        persistence.persistIfDue(count = 100, now = 20_001) {
          attempts += 1
        }

    assertTrue(retried)
    assertEquals(2, attempts)
  }

  @Test
  fun successfulWriteAdvancesThrottleState() {
    val persistence = StepSamplePersistence(minStepDelta = 5, minWriteIntervalMs = 10_000)

    assertTrue(persistence.persistIfDue(count = 100, now = 20_000) {})
    assertFalse(persistence.persistIfDue(count = 101, now = 20_001) {})
    assertTrue(persistence.persistIfDue(count = 105, now = 20_002) {})
  }
}