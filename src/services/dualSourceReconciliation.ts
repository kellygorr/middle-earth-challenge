import type { DistanceEntry } from '../types';
import { DEFAULT_SAVE_ID } from '../constants/gameConstants';
import { useProgressStore } from '../stores/progressStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  getActiveFitnessService,
  type FitnessServiceInterface,
} from './fitnessService';
import { METERS_TO_MILES } from '../utils/stride';

const RECONCILIATION_PREFIX = 'health_reconciliation_';

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function nextLocalDay(dayStart: number): number {
  const date = new Date(dayStart);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function localDateKey(dayStart: number): string {
  const date = new Date(dayStart);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function reconciliationEntryId(dayStart: number): string {
  return `${RECONCILIATION_PREFIX}${localDateKey(dayStart)}`;
}

export function calculateHealthTopUp(
  healthMiles: number,
  creditedTrackedMiles: number,
): number {
  return Math.max(0, healthMiles - creditedTrackedMiles);
}

export interface ReconciliationResult {
  daysReconciled: number;
  milesAdded: number;
}

export async function reconcileCompletedDualTrackingDays(
  options: {
    now?: number;
    fitness?: FitnessServiceInterface;
  } = {},
): Promise<ReconciliationResult> {
  const now = options.now ?? Date.now();
  const todayStart = startOfLocalDay(now);
  const settings = useSettingsStore.getState();

  if (settings.trackingMode !== 'dual') {
    return { daysReconciled: 0, milesAdded: 0 };
  }

  const initialCursor = settings.lastHealthReconciledThrough;
  if (initialCursor === null) {
    settings.setLastHealthReconciledThrough(todayStart);
    return { daysReconciled: 0, milesAdded: 0 };
  }
  let cursor = initialCursor;

  if (cursor >= todayStart) {
    return { daysReconciled: 0, milesAdded: 0 };
  }

  const fitness = options.fitness ?? getActiveFitnessService();
  await fitness.initialize(settings.syncProvider);

  let daysReconciled = 0;
  let milesAdded = 0;

  while (cursor < todayStart) {
    const dayEnd = nextLocalDay(cursor);
    const healthRecords = await fitness.getDistanceRecordsBetween(
      new Date(cursor),
      new Date(dayEnd),
    );
    const healthMiles = healthRecords.reduce(
      (sum, record) => sum + record.distanceMeters * METERS_TO_MILES,
      0,
    );
    const healthSteps = healthRecords.reduce(
      (sum, record) => sum + record.steps,
      0,
    );

    const progress = useProgressStore.getState();
    const creditedTrackedEntries = progress.distanceEntries.filter(
      entry =>
        (entry.source === 'pedometer' ||
          entry.source === 'health-connect' ||
          entry.source === 'apple-health') &&
        entry.date >= cursor &&
        entry.date < dayEnd,
    );
    const creditedTrackedMiles = creditedTrackedEntries.reduce(
      (sum, entry) => sum + entry.miles,
      0,
    );
    const creditedTrackedSteps = creditedTrackedEntries.reduce(
      (sum, entry) => sum + entry.steps,
      0,
    );
    const topUpMiles = calculateHealthTopUp(healthMiles, creditedTrackedMiles);
    const topUpSteps = calculateHealthTopUp(healthSteps, creditedTrackedSteps);
    const entryId = reconciliationEntryId(cursor);
    const existing = progress.distanceEntries.find(
      entry => entry.id === entryId,
    );

    if (topUpMiles > 0 || topUpSteps > 0) {
      const entry: DistanceEntry = {
        id: entryId,
        saveId: DEFAULT_SAVE_ID,
        date: cursor + Math.floor((dayEnd - cursor) / 2),
        miles: topUpMiles,
        steps: topUpSteps,
        source: 'health-reconciliation',
      };
      if (existing) {
        await progress.updateDistanceEntry(entry);
        milesAdded += topUpMiles - existing.miles;
      } else {
        await progress.addDistanceEntry(entry);
        milesAdded += topUpMiles;
      }
    } else if (existing) {
      await progress.removeDistanceEntry(entryId);
      milesAdded -= existing.miles;
    }

    const updated = useProgressStore.getState();
    updated.setMiles(updated.getTotalMiles());
    updated.setSteps(updated.getTotalSteps());
    await updated.persistMilesSnapshot();

    cursor = dayEnd;
    useSettingsStore.getState().setLastHealthReconciledThrough(cursor);
    daysReconciled += 1;
  }

  return { daysReconciled, milesAdded };
}
