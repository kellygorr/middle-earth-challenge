package com.middleearthchallenge.pedometer

internal class StepSamplePersistence(
    private val minStepDelta: Long,
    private val minWriteIntervalMs: Long,
) {
  private var lastCount: Long = -1L
  private var lastWriteMs: Long = 0L

  fun reset() {
    lastCount = -1L
    lastWriteMs = 0L
  }

  fun persistIfDue(count: Long, now: Long, persist: () -> Unit): Boolean {
    val delta = if (lastCount < 0) minStepDelta else count - lastCount
    if (delta < minStepDelta && now - lastWriteMs < minWriteIntervalMs) {
      return false
    }

    persist()
    lastCount = count
    lastWriteMs = now
    return true
  }
}