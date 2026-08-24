/**
 * Detects that pedometer background commits have stopped.
 *
 * This is possible only because a commit advances the watermark even when the
 * window contained zero steps (see `commitPedometerRange` — the watermark is
 * written before the empty-entries early return). A stale watermark therefore
 * means commits stopped, not that the user stopped walking. Those two
 * conditions look identical in the distance history, and only the first is a
 * fault.
 *
 * `PedometerBackgroundWorker` retries when its Headless JS task cannot run. If
 * the recording service itself is gone, there are no native samples to commit;
 * foreground reconciliation reports that distinct, user-actionable failure.
 */

import { PEDOMETER_STALL_THRESHOLD_MS } from '../constants/sync';
import type { TrackingMode } from '../types';

export type PedometerCommitHealth =
  /** Commits are landing at the expected cadence. */
  | { status: 'ok' }
  /**
   * Stall detection does not apply. `mode` means the user is not on a
   * pedometer-backed source; `never-committed` means there is no watermark to
   * measure staleness against yet.
   */
  | { status: 'not-applicable'; reason: 'mode' | 'never-committed' }
  /**
   * The foreground step service was gone long enough to have cost steps.
   * Nothing was written to native `step_samples` for that window, so those
   * steps do not exist anywhere and cannot be recovered -- only re-entered by
   * hand. Thresholded so a reboot, an app update or a crash the user notices
   * promptly stays silent.
   */
  | { status: 'service-stopped'; lastCommitAt: number; staleForMs: number };

export interface PedometerCommitHealthInput {
  trackingMode: TrackingMode;
  /** `settingsStore.lastSyncTimestamp`, the pedometer commit watermark. */
  lastCommitAt: number | null;
  now: number;
  /** `pedometerService.isServiceRunning()`. */
  serviceRunning: boolean;
}

export function evaluatePedometerCommitHealth({
  trackingMode,
  lastCommitAt,
  now,
  serviceRunning,
}: PedometerCommitHealthInput): PedometerCommitHealth {
  if (trackingMode !== 'pedometer' && trackingMode !== 'dual') {
    return { status: 'not-applicable', reason: 'mode' };
  }

  if (lastCommitAt === null) {
    return { status: 'not-applicable', reason: 'never-committed' };
  }

  const staleForMs = now - lastCommitAt;

  // A watermark ahead of the clock means a device clock change, not a stall.
  if (staleForMs < 0) {
    return { status: 'ok' };
  }

  if (staleForMs <= PEDOMETER_STALL_THRESHOLD_MS) {
    return { status: 'ok' };
  }

  if (serviceRunning) {
    // Future telemetry hook: background commits were delayed, but native
    // samples are intact and the foreground sync recovers them automatically.
    return { status: 'ok' };
  }

  return { status: 'service-stopped', lastCommitAt, staleForMs };
}
