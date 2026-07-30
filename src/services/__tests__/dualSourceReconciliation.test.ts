import type { FitnessServiceInterface } from '../fitnessService';

const mockSettingsState: { ref: any } = { ref: null };
const mockProgressState: { ref: any } = { ref: null };

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: { getState: () => mockSettingsState.ref },
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: { getState: () => mockProgressState.ref },
}));

import {
  reconcileCompletedDualTrackingDays,
  reconciliationEntryId,
  startOfLocalDay,
} from '../dualSourceReconciliation';

function resetState(cursor: number, entries: any[] = []) {
  const settings = {
    trackingMode: 'dual',
    syncProvider: 'health-connect',
    lastHealthReconciledThrough: cursor,
    setLastHealthReconciledThrough: jest.fn((value: number) => {
      settings.lastHealthReconciledThrough = value;
    }),
  };
  const progress = {
    distanceEntries: entries,
    miles: entries.reduce((sum, entry) => sum + entry.miles, 0),
    steps: entries.reduce((sum, entry) => sum + entry.steps, 0),
    addDistanceEntry: jest.fn(async (entry: any) => {
      progress.distanceEntries = [entry, ...progress.distanceEntries];
    }),
    updateDistanceEntry: jest.fn(async (entry: any) => {
      progress.distanceEntries = progress.distanceEntries.map(existing =>
        existing.id === entry.id ? entry : existing,
      );
    }),
    removeDistanceEntry: jest.fn(async (id: string) => {
      progress.distanceEntries = progress.distanceEntries.filter(
        entry => entry.id !== id,
      );
    }),
    getTotalMiles: () =>
      progress.distanceEntries.reduce((sum, entry) => sum + entry.miles, 0),
    getTotalSteps: () =>
      progress.distanceEntries.reduce((sum, entry) => sum + entry.steps, 0),
    setMiles: jest.fn((value: number) => {
      progress.miles = value;
    }),
    setSteps: jest.fn((value: number) => {
      progress.steps = value;
    }),
    persistMilesSnapshot: jest.fn(async () => {}),
  };
  mockSettingsState.ref = settings;
  mockProgressState.ref = progress;
  return { settings, progress };
}

function mockFitness(
  getDistanceRecordsBetween: jest.Mock,
): FitnessServiceInterface {
  return {
    initialize: jest.fn(async () => {}),
    getDistanceRecordsBetween,
  } as unknown as FitnessServiceInterface;
}

describe('dual source reconciliation', () => {
  it('reconciles every missed completed day and stores only health top-ups', async () => {
    const dayOne = new Date(2026, 6, 1).getTime();
    const dayTwo = new Date(2026, 6, 2).getTime();
    const today = new Date(2026, 6, 3).getTime();
    const { settings, progress } = resetState(dayOne, [
      {
        id: 'pedo_day_one',
        date: dayOne + 60_000,
        miles: 2,
        steps: 2000,
        source: 'pedometer',
      },
      {
        id: 'pedo_day_two',
        date: dayTwo + 60_000,
        miles: 4,
        steps: 4000,
        source: 'pedometer',
      },
    ]);
    const getRecords = jest.fn(async (start: Date) => {
      const miles = start.getTime() === dayOne ? 5 : 3;
      return [
        {
          id: 'aggregate',
          startTime: start.toISOString(),
          endTime: start.toISOString(),
          distanceMeters: miles / 0.000621371,
          steps: 0,
        },
      ];
    });

    const result = await reconcileCompletedDualTrackingDays({
      now: today + 12 * 60 * 60 * 1000,
      fitness: mockFitness(getRecords),
    });

    expect(result.daysReconciled).toBe(2);
    expect(settings.lastHealthReconciledThrough).toBe(today);
    const topUp = progress.distanceEntries.find(
      entry => entry.id === reconciliationEntryId(dayOne),
    );
    expect(topUp.miles).toBeCloseTo(3);
    expect(
      progress.distanceEntries.find(
        entry => entry.id === reconciliationEntryId(dayTwo),
      ),
    ).toBeUndefined();
    expect(progress.persistMilesSnapshot).toHaveBeenCalledTimes(2);

    const rerun = await reconcileCompletedDualTrackingDays({
      now: today + 12 * 60 * 60 * 1000,
      fitness: mockFitness(getRecords),
    });
    expect(rerun.daysReconciled).toBe(0);
    expect(getRecords).toHaveBeenCalledTimes(2);
  });

  it('does not advance the cursor when Health Connect fails', async () => {
    const yesterday = new Date(2026, 6, 2).getTime();
    const today = startOfLocalDay(new Date(2026, 6, 3, 12).getTime());
    const { settings, progress } = resetState(yesterday);
    const failure = new Error('permission revoked');

    await expect(
      reconcileCompletedDualTrackingDays({
        now: today + 60_000,
        fitness: mockFitness(jest.fn().mockRejectedValue(failure)),
      }),
    ).rejects.toThrow('permission revoked');

    expect(settings.lastHealthReconciledThrough).toBe(yesterday);
    expect(progress.persistMilesSnapshot).not.toHaveBeenCalled();
  });

  it('retains progress through the last successful day when a later day fails', async () => {
    const dayOne = new Date(2026, 6, 1).getTime();
    const dayTwo = new Date(2026, 6, 2).getTime();
    const dayThree = new Date(2026, 6, 3).getTime();
    const { settings } = resetState(dayOne);
    const getRecords = jest.fn(async (start: Date) => {
      if (start.getTime() === dayTwo) {
        throw new Error('temporary Health Connect failure');
      }
      return [];
    });

    await expect(
      reconcileCompletedDualTrackingDays({
        now: dayThree + 60_000,
        fitness: mockFitness(getRecords),
      }),
    ).rejects.toThrow('temporary Health Connect failure');

    expect(settings.lastHealthReconciledThrough).toBe(dayTwo);
    expect(getRecords).toHaveBeenCalledTimes(2);
  });

  it('removes a stale top-up when pedometer distance becomes higher', async () => {
    const yesterday = new Date(2026, 6, 2).getTime();
    const today = new Date(2026, 6, 3).getTime();
    const topUpId = reconciliationEntryId(yesterday);
    const { progress } = resetState(yesterday, [
      {
        id: 'pedo',
        date: yesterday + 60_000,
        miles: 5,
        steps: 5000,
        source: 'pedometer',
      },
      {
        id: topUpId,
        date: yesterday + 12 * 60 * 60 * 1000,
        miles: 2,
        steps: 2000,
        source: 'health-reconciliation',
      },
    ]);
    const getRecords = jest.fn().mockResolvedValue([
      {
        id: 'aggregate',
        startTime: new Date(yesterday).toISOString(),
        endTime: new Date(today).toISOString(),
        distanceMeters: 4 / 0.000621371,
        steps: 0,
      },
    ]);

    await reconcileCompletedDualTrackingDays({
      now: today + 60_000,
      fitness: mockFitness(getRecords),
    });

    expect(progress.removeDistanceEntry).toHaveBeenCalledWith(topUpId);
    expect(
      progress.distanceEntries.find(entry => entry.id === topUpId),
    ).toBeUndefined();
  });

  it('excludes manual entries from the pedometer comparison', async () => {
    const yesterday = new Date(2026, 6, 2).getTime();
    const today = new Date(2026, 6, 3).getTime();
    const { progress } = resetState(yesterday, [
      {
        id: 'pedo',
        date: yesterday + 60_000,
        miles: 2,
        steps: 2000,
        source: 'pedometer',
      },
      {
        id: 'manual',
        date: yesterday + 120_000,
        miles: 10,
        steps: 10000,
        source: 'manual-distance',
      },
    ]);
    const getRecords = jest.fn().mockResolvedValue([
      {
        id: 'aggregate',
        startTime: new Date(yesterday).toISOString(),
        endTime: new Date(today).toISOString(),
        distanceMeters: 5 / 0.000621371,
        steps: 0,
      },
    ]);

    await reconcileCompletedDualTrackingDays({
      now: today + 60_000,
      fitness: mockFitness(getRecords),
    });

    const topUp = progress.distanceEntries.find(
      entry => entry.id === reconciliationEntryId(yesterday),
    );
    expect(topUp.miles).toBeCloseTo(3);
  });

  it('uses existing health and pedometer entries as the transition-day baseline', async () => {
    const yesterday = new Date(2026, 6, 2).getTime();
    const today = new Date(2026, 6, 3).getTime();
    const { progress } = resetState(yesterday, [
      {
        id: 'health_before_switch',
        date: yesterday + 60_000,
        miles: 2,
        steps: 2000,
        source: 'health-connect',
      },
      {
        id: 'pedometer_after_switch',
        date: yesterday + 12 * 60 * 60 * 1000,
        miles: 1,
        steps: 1000,
        source: 'pedometer',
      },
    ]);
    const getRecords = jest.fn().mockResolvedValue([
      {
        id: 'aggregate',
        startTime: new Date(yesterday).toISOString(),
        endTime: new Date(today).toISOString(),
        distanceMeters: 4 / 0.000621371,
        steps: 0,
      },
    ]);

    await reconcileCompletedDualTrackingDays({
      now: today + 60_000,
      fitness: mockFitness(getRecords),
    });

    const topUp = progress.distanceEntries.find(
      entry => entry.id === reconciliationEntryId(yesterday),
    );
    expect(topUp.miles).toBeCloseTo(1);
  });
});
