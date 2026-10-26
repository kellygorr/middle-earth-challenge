package com.middleearthchallenge.pedometer

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred

internal enum class PedometerBackgroundTaskOutcome {
  SUCCESS,
  RETRY,
}

internal object PedometerBackgroundTaskResults {
  private val pending = ConcurrentHashMap<String, CompletableDeferred<PedometerBackgroundTaskOutcome>>()

  fun register(requestId: String): CompletableDeferred<PedometerBackgroundTaskOutcome> {
    val result = CompletableDeferred<PedometerBackgroundTaskOutcome>()
    check(pending.putIfAbsent(requestId, result) == null) {
      "Background task result already registered: $requestId"
    }
    return result
  }

  fun report(requestId: String, succeeded: Boolean): Boolean {
    val result = pending[requestId] ?: return false
    val outcome =
        if (succeeded) PedometerBackgroundTaskOutcome.SUCCESS
        else PedometerBackgroundTaskOutcome.RETRY
    return result.complete(outcome)
  }

  fun remove(
      requestId: String,
      result: CompletableDeferred<PedometerBackgroundTaskOutcome>,
  ) {
    pending.remove(requestId, result)
  }
}