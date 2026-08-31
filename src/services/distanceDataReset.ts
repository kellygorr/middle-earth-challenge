import { DEFAULT_SAVE_ID } from '../constants/gameConstants';
import {
  applyCommittedEntryChanges,
  initialSyncStatus,
  useProgressStore,
} from '../stores/progressStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { DistanceSource } from '../types';
import { database } from './database';
import { startOfLocalDay } from './dualSourceReconciliation';

interface ResetDistanceDataOptions {
  clearAll?: boolean;
  removeSources?: DistanceSource[];
  resetAt?: number;
}

export async function resetDistanceData({
  clearAll = false,
  removeSources,
  resetAt = Date.now(),
}: ResetDistanceDataOptions): Promise<void> {
  const reconciliationBoundary = startOfLocalDay(resetAt);
  const progress = await database.resetDistanceData(
    DEFAULT_SAVE_ID,
    { clearAll, removeSources },
    resetAt,
    reconciliationBoundary,
  );

  useProgressStore.setState(state => ({
    distanceEntries: applyCommittedEntryChanges(
      state.distanceEntries,
      progress.changes,
    ),
    miles: progress.miles,
    steps: progress.steps,
    syncStatus: initialSyncStatus,
    ...(clearAll
      ? {
          triviaUnlocks: [],
          lastSyncDate: null,
          testOverrideMiles: null,
        }
      : null),
  }));
  useSettingsStore.setState({
    syncStartDate: resetAt,
    lastSyncTimestamp: null,
    pedometerCursor: null,
    healthLookbackStartTimestamp: resetAt,
    lastHealthReconciledThrough: reconciliationBoundary,
  });
}
