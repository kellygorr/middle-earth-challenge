/**
 * The single source of truth for turning raw pedometer step samples
 * into `DistanceEntry` rows.
 *
 * Called by every commit trigger — 2-minute live tick, AppState →
 * 'active' catch-up, AppState → 'background' flush, WorkManager BG
 * sweep, mode-switch flush, Sync-Now button. See docs/pedometer-mode.md
 * § "Row model & commit strategy" for the model.
 *
 * This helper owns the watermark but not sync status. It:
 *
 *   1. reads `getStepsBetween(fromMs, toMs)` from the native service,
 *   2. converts steps → miles,
 *   3. atomically writes any `DistanceEntry` rows, refreshes the snapshot,
 *      and advances `lastSyncTimestamp`,
 *   4. publishes progress and watermark state only after commit.
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
import { PEDOMETER_SAMPLE_RETENTION_MS } from '../constants/sync';
import { useSettingsStore } from '../stores/settingsStore';

export interface PedometerCommitResult {
  /** Steps read from the native service in [fromMs, toMs). */
  steps: number;
  /** Miles derived from steps (steps × stride × meters→miles). */
  miles: number;
  /** True iff a new `DistanceEntry` was inserted for this window. */
  entryWritten: boolean;
}

let commitQueue: Promise<void> = Promise.resolve();

/**
 * Materialize a single pedometer `DistanceEntry` for [fromMs, toMs).
 *
 * Returns `{ steps: 0, miles: 0, entryWritten: false }` if the native read
 * returns zero. Read or persistence failures reject without advancing the
 * watermark.
 */
export function commitPedometerRange(
  fromMs: number,
  toMs: number,
): Promise<PedometerCommitResult> {
  const commit = commitQueue.then(() =>
    commitPedometerRangeSerialized(fromMs, toMs),
  );
  commitQueue = commit.then(
    () => undefined,
    () => undefined,
  );
  return commit;
}

async function commitPedometerRangeSerialized(
  requestedFromMs: number,
  toMs: number,
): Promise<PedometerCommitResult> {
  const currentWatermark = useSettingsStore.getState().lastSyncTimestamp;
  let fromMs = requestedFromMs;
  if (currentWatermark !== null && currentWatermark !== requestedFromMs) {
    if (toMs <= currentWatermark) {
      return { steps: 0, miles: 0, entryWritten: false };
    }
    fromMs = currentWatermark;
  }

  // Guard against inverted / degenerate windows — a mode-switch or
  // AppState double-fire can produce toMs === fromMs, and older callers
  // could plausibly pass toMs < fromMs. Treat both as no-ops so we
  // don't feed nonsense timestamps into the native module.
  const expectedCursor = useSettingsStore.getState().pedometerCursor;
  let readCursor = expectedCursor;
  if (toMs === fromMs && !readCursor) {
    return { steps: 0, miles: 0, entryWritten: false };
  }

  if (toMs < fromMs && !readCursor) {
    readCursor = await pedometerService.getSampleCursorAtOrBefore(fromMs);
    if (!readCursor) {
      return { steps: 0, miles: 0, entryWritten: false };
    }
  }

  const entries: DistanceEntry[] = [];
  let steps = 0;
  let latestCursor = readCursor;

  if (readCursor && toMs < fromMs) {
    const window = await pedometerService.getStepsSinceCursor(readCursor);
    steps = Math.max(0, Math.floor(window.steps));
    latestCursor = window.latestCursor ?? readCursor;
    if (steps > 0) {
      entries.push({
        id: `pedo_cursor_${readCursor.sampleId}_${latestCursor.sampleId}`,
        saveId: DEFAULT_SAVE_ID,
        date: latestCursor.timestampMs,
        miles: stepsToMiles(steps),
        steps,
        source: 'pedometer',
      });
    }
  } else {
    const segments: Array<{ fromMs: number; toMs: number }> = [];
    let segmentStart = fromMs;
    while (segmentStart < toMs) {
      const nextMidnight = new Date(segmentStart);
      nextMidnight.setHours(24, 0, 0, 0);
      const segmentEnd = Math.min(toMs, nextMidnight.getTime());
      segments.push({ fromMs: segmentStart, toMs: segmentEnd });
      segmentStart = segmentEnd;
    }

    for (const segment of segments) {
      try {
        const window = await pedometerService.getStepsBetween(
          segment.fromMs,
          segment.toMs,
        );
        const segmentSteps = Math.max(0, Math.floor(window.steps));
        latestCursor = window.latestCursor ?? latestCursor;
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
  }

  const miles = stepsToMiles(steps);

  const progress = useProgressStore.getState();
  // Snapshot before-total so we can compare with the after-total below
  // and fire a system notification if the user crossed a checkpoint
  // in this window. Must be read before `addDistanceEntries` mutates
  // the store.
  const milesBefore = progress.miles ?? 0;
  const applied = latestCursor
    ? await progress.applyPedometerSyncChunk(
        entries,
        toMs,
        expectedCursor,
        latestCursor,
      )
    : await progress.applyPedometerSyncChunk(entries, toMs);
  if (!applied) {
    return { steps: 0, miles: 0, entryWritten: false };
  }
  useSettingsStore.setState({
    lastSyncTimestamp: toMs,
    pedometerCursor: latestCursor,
  });

  // Only safe once the watermark has advanced past this window.
  await pruneCommittedSamples(toMs);

  if (entries.length === 0) {
    return { steps: 0, miles: 0, entryWritten: false };
  }

  const totalMiles = useProgressStore.getState().miles;

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

/**
 * Drop raw samples the committed watermark has made unnecessary. Best-effort:
 * a failure here must not fail an otherwise successful commit, since the only
 * consequence is that the table stays large.
 */
async function pruneCommittedSamples(watermarkMs: number): Promise<void> {
  const cutoff = watermarkMs - PEDOMETER_SAMPLE_RETENTION_MS;
  if (cutoff <= 0) return;
  try {
    await pedometerService.pruneSamplesBefore(cutoff);
  } catch (error) {
    console.warn('[pedometer] sample prune failed', { cutoff, error });
  }
}
