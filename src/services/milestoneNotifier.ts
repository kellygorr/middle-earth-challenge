/**
 * Journey-milestone notification helper (Phase 3c of the pedometer
 * plan — see docs/pedometer-mode.md).
 *
 * Called by the pedometer commit path with the miles total before and
 * after a commit. Fires one system notification per checkpoint whose
 * `CUMULATIVE_MILES` was crossed in that window, updates the
 * `lastNotifiedCheckpointIndex` watermark, and never rejects — this is
 * best-effort UX that must not derail the commit.
 *
 * Scope note: only fires on pedometer commits today. Health-app sync
 * commits do not (yet) trigger milestone notifications.
 */

import { AppState } from 'react-native';
import checkpoints from '../constants/checkpoints.json';
import type { PointType } from '../types';
import { useSettingsStore } from '../stores/settingsStore';
import { pedometerService } from './pedometerService';

/**
 * Compare miles-before / miles-after against every checkpoint's
 * `CUMULATIVE_MILES` and fire a system notification for each one that
 * fell in the interval `(milesBefore, milesAfter]`. `isStart`
 * checkpoints (Hobbiton) are skipped — the user is already there when
 * they open the app for the first time.
 *
 * Guards against duplicates via the persisted
 * `lastNotifiedCheckpointIndex` setting; the highest checkpoint index
 * we ever fire in this call is written back so a re-processed commit
 * (retry, dev tools) won't re-announce.
 *
 * Suppresses notifications when the app is currently in the
 * foreground — the map-screen celebration + checkpoint modal already
 * mark the crossing there, so adding a system ping would just be
 * noise on the user's own screen. If backgrounded/inactive at fire
 * time, we notify; the guard above still marks the checkpoint as
 * notified even when suppressed so the user doesn't get a delayed
 * ping the next time we go to the background.
 */
export async function checkAndFireMilestones(
  milesBefore: number,
  milesAfter: number,
): Promise<void> {
  if (milesAfter <= milesBefore) return;

  const cps = checkpoints as PointType[];
  const settings = useSettingsStore.getState();
  const lastNotified = settings.lastNotifiedCheckpointIndex ?? -1;

  // Collect crossings in ascending order of checkpoint index so we
  // fire earlier checkpoints first (matches the walker's chronology).
  const crossings: { index: number; cp: PointType }[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (cp?.isStart) continue;
    const m = Number(cp?.CUMULATIVE_MILES);
    if (!Number.isFinite(m)) continue;
    if (m <= milesBefore) continue;
    if (m > milesAfter) continue;
    if (i <= lastNotified) continue;
    crossings.push({ index: i, cp });
  }

  if (crossings.length === 0) return;

  const isForeground = AppState.currentState === 'active';

  for (const { index, cp } of crossings) {
    if (!isForeground) {
      try {
        await pedometerService.fireMilestoneNotification(
          `You reached ${cp.name}!`,
          buildNotificationBody(cp),
          index,
        );
      } catch {
        // Swallow — this is best-effort UX; never let it derail the
        // caller's commit path.
      }
    }
  }

  // Always advance the watermark to the highest index we processed,
  // even when suppressed for foreground. Otherwise the user could see
  // a delayed ping the next time the app is backgrounded and a new
  // commit lands.
  const highest = crossings[crossings.length - 1].index;
  if (highest > lastNotified) {
    try {
      await settings.updateSyncSettings({
        lastNotifiedCheckpointIndex: highest,
      });
    } catch {
      // Persistence is best-effort and must not derail the pedometer commit.
    }
  }
}

/**
 * Short human summary shown as the notification body. Prefers the
 * checkpoint's description text when short, else falls back to a
 * simple congratulatory line.
 */
function buildNotificationBody(cp: PointType): string {
  const desc = cp.description?.text;
  if (typeof desc === 'string' && desc.length > 0) {
    // Take the first sentence / first ~120 chars so the notification
    // stays readable on the lock screen. Split on newline first
    // (checkpoint descriptions often have paragraph breaks) then on
    // the first period.
    const firstLine = desc.split(/\r?\n/, 1)[0];
    const firstSentence = firstLine.split(/(?<=\.)\s/, 1)[0];
    if (firstSentence.length <= 140) return firstSentence;
    return firstSentence.slice(0, 137) + '…';
  }
  return "You've reached a new checkpoint on your journey.";
}
