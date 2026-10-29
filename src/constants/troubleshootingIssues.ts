/**
 * Classification for `SyncError` values.
 *
 * Two things the union does not encode on its own:
 *
 *  - **Slot.** Which subsystem an issue belongs to. Only one issue per slot
 *    can be true at a time, because within a subsystem the failures cascade -
 *    a revoked permission stops the service, which stalls commits. Reporting
 *    all three would be one cause and two symptoms. Across slots they are
 *    genuinely independent, so those must not collapse.
 *  - **Severity.** Some kinds are faults the user must act on; `sourceFallback`
 *    reports a switch that already happened successfully and needs no action.
 */

import type { SyncError } from '../stores/progressStore';

export type TroubleshootingIssueSlot =
  | 'pedometer'
  | 'health-app'
  /** A single fault affecting both sources at once. */
  | 'cross'
  /** App-level, belonging to neither source. */
  | 'app'
  /** Informational; never competes with a fault for a slot. */
  | 'notice';

export type TroubleshootingIssueSeverity = 'error' | 'info';

export function troubleshootingIssueSlot(
  error: SyncError,
): TroubleshootingIssueSlot {
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
    default:
      return 'app';
  }
}

export function troubleshootingIssueSeverity(
  error: SyncError,
): TroubleshootingIssueSeverity {
  // Neither reports an unresolved fault the user must act on.
  return error.kind === 'sourceFallback' || error.kind === 'newUpgrade'
    ? 'info'
    : 'error';
}

/**
 * Slots an incoming issue supersedes, itself included. Only a genuine
 * cross-source fault replaces the single-source slots; a notice never
 * displaces a fault.
 */
export function supersededTroubleshootingIssueSlots(
  error: SyncError,
): TroubleshootingIssueSlot[] {
  const slot = troubleshootingIssueSlot(error);
  if (slot === 'cross') return ['cross', 'pedometer', 'health-app'];
  return [slot];
}

/** Faults first, so the pager opens on something actionable. */
export function orderTroubleshootingIssues<T extends { error: SyncError }>(
  issues: T[],
): T[] {
  return [...issues].sort((left, right) => {
    const leftInfo =
      troubleshootingIssueSeverity(left.error) === 'info' ? 1 : 0;
    const rightInfo =
      troubleshootingIssueSeverity(right.error) === 'info' ? 1 : 0;
    return leftInfo - rightInfo;
  });
}
