package com.middleearthchallenge.pedometer

import androidx.work.ListenableWorker
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PedometerBackgroundTaskResultsTest {
  @Test
  fun reportedFailureMapsToWorkManagerRetry() = runBlocking {
    val requestId = "failed-request"
    val result = PedometerBackgroundTaskResults.register(requestId)

    try {
      assertTrue(PedometerBackgroundTaskResults.report(requestId, succeeded = false))
      val outcome = result.await()

      assertEquals(PedometerBackgroundTaskOutcome.RETRY, outcome)
      assertEquals(
          ListenableWorker.Result.retry().javaClass,
          PedometerBackgroundWorker.workResultFor(outcome).javaClass)
    } finally {
      PedometerBackgroundTaskResults.remove(requestId, result)
    }
  }

  @Test
  fun unknownOrDuplicateReportsAreIgnored() = runBlocking {
    assertFalse(PedometerBackgroundTaskResults.report("unknown", succeeded = true))

    val requestId = "completed-request"
    val result = PedometerBackgroundTaskResults.register(requestId)
    try {
      assertTrue(PedometerBackgroundTaskResults.report(requestId, succeeded = true))
      assertFalse(PedometerBackgroundTaskResults.report(requestId, succeeded = false))
      assertEquals(PedometerBackgroundTaskOutcome.SUCCESS, result.await())
    } finally {
      PedometerBackgroundTaskResults.remove(requestId, result)
    }
  }
}