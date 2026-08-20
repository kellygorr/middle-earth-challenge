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

  // Local midnights are 23h apart across spring-forward and 25h across
  // fall-back, which a fixed 24h constant reads as a broken streak.
  describe('daylight saving transitions', () => {
    const startOfDay = (date: Date): number => {
      const copy = new Date(date);
      copy.setHours(0, 0, 0, 0);
      return copy.getTime();
    };
    const hoursBetweenMidnights = (a: Date, b: Date): number =>
      (startOfDay(b) - startOfDay(a)) / 3600000;

    it('runs in a timezone that observes DST', () => {
      // Without this the cases below would pass vacuously on a UTC machine.
      expect(
        hoursBetweenMidnights(new Date(2026, 2, 8), new Date(2026, 2, 9)),
      ).toBe(23);
      expect(
        hoursBetweenMidnights(new Date(2026, 10, 1), new Date(2026, 10, 2)),
      ).toBe(25);
    });

    it('spans a 23-hour spring-forward day', () => {
      // The clocks move at 2am on 2026-03-08, so 03-08 is only 23 hours long.
      jest.setSystemTime(new Date(2026, 2, 9, 12));
      const entries = [
        entry('before', new Date(2026, 2, 8, 9).getTime(), 1, 2000),
        entry('after', new Date(2026, 2, 9, 9).getTime(), 1, 2000),
      ];

      const stats = useStatsStore.getState().getStats(entries, 2, 4000);

      expect(stats?.activity.currentStreak).toBe(2);
      expect(stats?.activity.longestStreak).toBe(2);
    });

    it('spans a 25-hour fall-back day', () => {
      // The clocks move back at 2am on 2026-11-01, making it 25 hours long.
      jest.setSystemTime(new Date(2026, 10, 2, 12));
      const entries = [
        entry('before', new Date(2026, 10, 1, 9).getTime(), 1, 2000),
        entry('after', new Date(2026, 10, 2, 9).getTime(), 1, 2000),
      ];

      const stats = useStatsStore.getState().getStats(entries, 2, 4000);

      expect(stats?.activity.currentStreak).toBe(2);
      expect(stats?.activity.longestStreak).toBe(2);
    });

    it('counts inclusive calendar days across spring-forward', () => {
      jest.setSystemTime(new Date(2026, 2, 9, 12));
      const entries = [
        entry('before', new Date(2026, 2, 8, 22).getTime(), 2, 4000),
        entry('after', new Date(2026, 2, 9, 6).getTime(), 2, 4000),
      ];

      const stats = useStatsStore.getState().getStats(entries, 4, 8000);

      // Two calendar days despite only ~8 hours of wall-clock separation.
      expect(stats?.pace.averageMilesPerDay).toBe(2);
    });
  });
});
