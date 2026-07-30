/**
 * The single source of truth for turning raw pedometer step samples
 * into `DistanceEntry` rows.
 *
 * Called by every commit trigger — 2-minute live tick, AppState →
 * 'active' catch-up, AppState → 'background' flush, WorkManager BG
 * sweep, mode-switch flush, Sync-Now button. See docs/pedometer-mode.md
 * § "Row model & commit strategy" for the model.
 *
 * This helper does NOT manage the watermark or sync status — that's the
 * caller's job. It only:
 *
 *   1. reads `getStepsBetween(fromMs, toMs)` from the native service,
 *   2. converts steps → miles,
 *   3. writes one `DistanceEntry` (source: `'pedometer'`) if steps > 0,
 *   4. recomputes `progressStore.miles` and persists the snapshot.
 *
 * Isolating it from the hook so it can also be called from the
 * headless JS task WorkManager fires — where React hooks don't exist.
 */

import { pedometerService } from './pedometerService';
import { useProgressStore } from '../stores/progressStore';
import type { DistanceEntry } from '../types';
import { stepsToMiles } from '../utils/stride';
import { checkAndFireMilestones } from './milestoneNotifier';
import { DEFAULT_SAVE_ID } from '../constants/gameConstants';

export interface PedometerCommitResult {
  /** Steps read from the native service in [fromMs, toMs). */
  steps: number;
  /** Miles derived from steps (steps × stride × meters→miles). */
  miles: number;
  /** True iff a new `DistanceEntry` was inserted for this window. */
  entryWritten: boolean;
}

/**
 * Materialize a single pedometer `DistanceEntry` for [fromMs, toMs).
 *
 * Returns `{ steps: 0, miles: 0, entryWritten: false }` if the native
 * read fails or returns zero — the caller decides whether to surface an
 * error or advance the watermark anyway.
 */
export async function commitPedometerRange(
  fromMs: number,
  toMs: number,
): Promise<PedometerCommitResult> {
  // Guard against inverted / degenerate windows — a mode-switch or
  // AppState double-fire can produce toMs === fromMs, and older callers
  // could plausibly pass toMs < fromMs. Treat both as no-ops so we
  // don't feed nonsense timestamps into the native module.
  if (toMs <= fromMs) {
    return { steps: 0, miles: 0, entryWritten: false };
  }

  const segments: Array<{ fromMs: number; toMs: number }> = [];
  let segmentStart = fromMs;
  while (segmentStart < toMs) {
    const nextMidnight = new Date(segmentStart);
    nextMidnight.setHours(24, 0, 0, 0);
    const segmentEnd = Math.min(toMs, nextMidnight.getTime());
    segments.push({ fromMs: segmentStart, toMs: segmentEnd });
    segmentStart = segmentEnd;
  }

  const entries: DistanceEntry[] = [];
  let steps = 0;
  for (const segment of segments) {
    try {
      const window = await pedometerService.getStepsBetween(
        segment.fromMs,
        segment.toMs,
      );
      const segmentSteps = Math.max(0, Math.floor(window.steps));
      steps += segmentSteps;
      if (segmentSteps > 0) {
        entries.push({
          id: `pedo_${segment.fromMs}`,
          saveId: DEFAULT_SAVE_ID,
          date:
            segment.fromMs + Math.floor((segment.toMs - segment.fromMs) / 2),
          miles: stepsToMiles(segmentSteps),
          steps: segmentSteps,
          source: 'pedometer',
        });
      }
    } catch (error) {
      console.warn('[pedometer] commit read failed', {
        fromMs: segment.fromMs,
        toMs: segment.toMs,
        error,
      });
      throw error;
    }
  }

  const miles = stepsToMiles(steps);

  if (entries.length === 0) {
    return { steps: 0, miles: 0, entryWritten: false };
  }

  const progress = useProgressStore.getState();
  // Snapshot before-total so we can compare with the after-total below
  // and fire a system notification if the user crossed a checkpoint
  // in this window. Must be read before `addDistanceEntries` mutates
  // the store.
  const milesBefore = progress.miles ?? 0;
  await progress.addDistanceEntries(entries);

  // Recompute total from the store — cheaper and less race-prone than
  // tracking a running total across ticks.
  const store = useProgressStore.getState();
  const totalMiles = store.getTotalMiles();
  const totalSteps = store.getTotalSteps();
  progress.setMiles(totalMiles);
  progress.setSteps(totalSteps);
  await progress.persistMilesSnapshot();

  // Milestone notifications (Phase 3c). Best-effort; never rejects.
  // Only fires on pedometer commits — health-app sync users don't get
  // milestone pings yet. See src/services/milestoneNotifier.ts.
  try {
    await checkAndFireMilestones(milesBefore, totalMiles);
  } catch (err) {
    console.warn('[pedometer] milestone notifier failed', err);
  }

  return { steps, miles, entryWritten: true };
}
