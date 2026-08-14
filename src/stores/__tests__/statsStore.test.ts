import type { DistanceEntry } from '../../types';
import { useStatsStore } from '../statsStore';

const entry = (
  id: string,
  date: number,
  miles: number,
  steps: number,
): DistanceEntry => ({
  id,
  saveId: 'default',
  date,
  miles,
  steps,
  source: 'pedometer',
});

describe('statsStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 13, 12));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses stored steps for completed and historical statistics', () => {
    const entries = [
      entry('today', new Date(2026, 7, 13, 9).getTime(), 1, 1200),
      entry('yesterday', new Date(2026, 7, 12, 9).getTime(), 2, 5700),
    ];

    const stats = useStatsStore.getState().getStats(entries, 3, 6900);

    expect(stats).not.toBeNull();
    expect(stats?.journey.stepsCompleted).toBe(6900);
    expect(stats?.activity.bestDaySteps).toBe(5700);
    expect(stats?.activity.stepsThisWeek).toBe(6900);
    expect(stats?.pace.averageStepsPerDay).toBe(3450);
    expect(stats?.pace.averageStepsPerActiveDay).toBe(3450);
  });
});
