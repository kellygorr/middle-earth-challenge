/**
 * Classification for `SyncError` values.
 *
 * Two things the union does not encode on its own:
 *
 *  - **Slot.** Which subsystem an issue belongs to. Only one issue per slot
 *    can be true at a time, because within a subsystem the failures cascade —
 *    a revoked permission stops the service, which stalls commits. Reporting
 *    all three would be one cause and two symptoms. Across slots they are
 *    genuinely independent, so those must not collapse.
 *  - **Severity.** Some kinds are faults the user must act on; `sourceFallback`
 *    reports a switch that already happened successfully and needs no action.
 */

import type { SyncError } from '../stores/progressStore';

export type SyncIssueSlot =
  | 'pedometer'
  | 'health-app'
  /** A single fault affecting both sources at once. */
  | 'cross'
  /** App-level, belonging to neither source (e.g. iOS background refresh). */
  | 'app'
  /** Informational; never competes with a fault for a slot. */
  | 'notice';

export type SyncIssueSeverity = 'error' | 'info';

export function syncErrorSlot(error: SyncError): SyncIssueSlot {
  switch (error.kind) {
    case 'permission':
      return error.source === 'both' ? 'cross' : error.source;
    // Kept apart from 'cross' so it can sit alongside a fault on the source
    // it switched to: "Switched to Pedometer" explains why you are there, and
    // the pedometer may then fail for its own reasons.
    case 'sourceFallback':
      return 'notice';
    case 'pedometerStorage':
    case 'pedometerServiceStopped':
      return 'pedometer';
    case 'timeout':
    case 'unavailable':
    case 'provider':
      return 'health-app';
    case 'backgroundDisabled':
      return 'app';
    default:
      return 'app';
  }
}

export function syncErrorSeverity(error: SyncError): SyncIssueSeverity {
  // The switch already happened and tracking continues; nothing to fix.
  return error.kind === 'sourceFallback' ? 'info' : 'error';
}

/**
 * Slots an incoming issue supersedes, itself included. Only a genuine
 * cross-source fault replaces the single-source slots; a notice never
 * displaces a fault.
 */
export function supersededSlots(error: SyncError): SyncIssueSlot[] {
  const slot = syncErrorSlot(error);
  if (slot === 'cross') return ['cross', 'pedometer', 'health-app'];
  return [slot];
}

/** Faults first, so the pager opens on something actionable. */
export function orderSyncIssues<T extends { error: SyncError }>(
  issues: T[],
): T[] {
  return [...issues].sort((left, right) => {
    const leftInfo = syncErrorSeverity(left.error) === 'info' ? 1 : 0;
    const rightInfo = syncErrorSeverity(right.error) === 'info' ? 1 : 0;
    return leftInfo - rightInfo;
  });
}
