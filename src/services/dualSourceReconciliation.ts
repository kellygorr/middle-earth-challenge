import type { DistanceEntry } from '../types';
import { DEFAULT_SAVE_ID } from '../constants/gameConstants';
import { useProgressStore } from '../stores/progressStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  getActiveFitnessService,
  type FitnessServiceInterface,
} from './fitnessService';
import { METERS_TO_MILES, milesToSteps, stepsToMiles } from '../utils/stride';
import { database } from './database';

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
  healthSteps: number,
  creditedTrackedSteps: number,
): number {
  return Math.max(0, healthSteps - creditedTrackedSteps);
}

export interface ReconciliationResult {
  daysReconciled: number;
  milesAdded: number;
}

async function buildReconciliationChangesForDay(
  dayStart: number,
  fitness: FitnessServiceInterface,
): Promise<{
  changes: { upsert?: DistanceEntry[]; removeIds?: string[] };
  milesChanged: number;
}> {
  const dayEnd = nextLocalDay(dayStart);
  const healthRecords = await fitness.getDistanceRecordsBetween(
    new Date(dayStart),
    new Date(dayEnd),
  );
  const healthMiles = healthRecords.reduce(
    (sum, record) => sum + record.distanceMeters * METERS_TO_MILES,
    0,
  );
  const measuredHealthSteps = healthRecords.reduce(
    (sum, record) => sum + record.steps,
    0,
  );
  const healthSteps =
    measuredHealthSteps > 0 ? measuredHealthSteps : milesToSteps(healthMiles);

  const dayEntries = await database.getDistanceEntriesBetween(
    DEFAULT_SAVE_ID,
    dayStart,
    dayEnd,
  );
  const creditedTrackedEntries = dayEntries.filter(
    entry =>
      entry.source === 'pedometer' ||
      entry.source === 'health-connect' ||
      entry.source === 'apple-health',
  );
  const creditedTrackedSteps = creditedTrackedEntries.reduce(
    (sum, entry) => sum + entry.steps,
    0,
  );
  const topUpSteps = calculateHealthTopUp(healthSteps, creditedTrackedSteps);
  const topUpMiles = stepsToMiles(topUpSteps);
  const entryId = reconciliationEntryId(dayStart);
  const existing = dayEntries.find(entry => entry.id === entryId);

  const changes: { upsert?: DistanceEntry[]; removeIds?: string[] } = {};
  if (topUpSteps > 0) {
    const entry: DistanceEntry = {
      id: entryId,
      saveId: DEFAULT_SAVE_ID,
      date: dayEnd - 1,
      miles: topUpMiles,
      steps: topUpSteps,
      source: 'health-reconciliation',
    };
    if (
      !existing ||
      Math.abs(existing.miles - entry.miles) > 0.001 ||
      existing.steps !== entry.steps ||
      existing.date !== entry.date
    ) {
      changes.upsert = [entry];
    }
    return { changes, milesChanged: topUpMiles - (existing?.miles ?? 0) };
  }

  if (existing) {
    changes.removeIds = [entryId];
    return { changes, milesChanged: -existing.miles };
  }

  return { changes, milesChanged: 0 };
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
    const applied = await useProgressStore
      .getState()
      .applyHealthReconciliationDay({}, todayStart);
    if (!applied) return { daysReconciled: 0, milesAdded: 0 };
    useSettingsStore.setState({ lastHealthReconciledThrough: todayStart });
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
    const dayStart = cursor;
    const dayEnd = nextLocalDay(dayStart);
    const progress = useProgressStore.getState();
    const { changes, milesChanged } = await buildReconciliationChangesForDay(
      dayStart,
      fitness,
    );

    cursor = dayEnd;
    const applied = await progress.applyHealthReconciliationDay(
      changes,
      cursor,
    );
    if (!applied) return { daysReconciled, milesAdded };
    useSettingsStore.setState({ lastHealthReconciledThrough: cursor });
    milesAdded += milesChanged;
    daysReconciled += 1;
  }

  return { daysReconciled, milesAdded };
}
