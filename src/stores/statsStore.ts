import { create } from 'zustand';
import { DistanceEntry } from '../types';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpoints from '../constants/checkpoints.json';

interface StatsStore {
  // Selectors (computed values from distanceEntries)
  getStats: (distanceEntries: DistanceEntry[], miles: number) => Stats | null;
  hasEnoughDataForStats: (distanceEntries: DistanceEntry[]) => boolean;
  getDateStarted: (distanceEntries: DistanceEntry[]) => Date | null;
}

export interface Stats {
  // Journey Progress
  journey: {
    checkpointsCompleted: number;
    checkpointsTotal: number;
    milesCompleted: number;
    milesTotalJourney: number;
    milesRemaining: number;
    milesUntilNextCheckpoint: number;
    nextCheckpointName: string | null;
    progressPercentage: number;
  };
  // Activity
  activity: {
    dateStarted: Date | null;
    totalActiveDays: number;
    bestDayMiles: number;
    bestDayDate: Date | null;
    currentStreak: number;
    longestStreak: number;
    milesThisWeek: number;
    milesLastWeek: number;
    milesThisMonth: number;
  };
  // Pace & Projections
  pace: {
    averageMilesPerDay: number;
    averageMilesPerActiveDay: number;
    estimatedDaysRemaining: number;
    estimatedCompletionDate: Date | null;
  };
}

// Helper: Get start of day for a timestamp
const getStartOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

// Helper: Calculate streaks from sorted entries
const calculateStreaks = (
  entries: DistanceEntry[],
): { current: number; longest: number } => {
  if (entries.length === 0) return { current: 0, longest: 0 };

  // Group entries by day
  const dayMap = new Map<number, number>();
  for (const entry of entries) {
    const dayStart = getStartOfDay(entry.date);
    dayMap.set(dayStart, (dayMap.get(dayStart) || 0) + entry.miles);
  }

  // Sort unique days
  const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b);
  if (sortedDays.length === 0) return { current: 0, longest: 0 };

  let longestStreak = 1;
  let currentStreak = 1;
  let tempStreak = 1;

  const ONE_DAY = 24 * 60 * 60 * 1000;
  const today = getStartOfDay(Date.now());

  for (let i = 1; i < sortedDays.length; i++) {
    const diff = sortedDays[i] - sortedDays[i - 1];
    if (diff === ONE_DAY) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Calculate current streak (consecutive days ending today or yesterday)
  const lastDay = sortedDays[sortedDays.length - 1];
  if (lastDay !== today && lastDay !== today - ONE_DAY) {
    currentStreak = 0;
  } else {
    currentStreak = 1;
    for (let i = sortedDays.length - 2; i >= 0; i--) {
      if (sortedDays[i + 1] - sortedDays[i] === ONE_DAY) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { current: currentStreak, longest: longestStreak };
};

// Helper: Get miles within a date range
const getMilesInRange = (
  entries: DistanceEntry[],
  startDate: Date,
  endDate: Date,
): number => {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return entries
    .filter(e => e.date >= start && e.date <= end)
    .reduce((sum, e) => sum + e.miles, 0);
};

// Helper: Get start of week (Sunday)
const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Get start of month
const getStartOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const useStatsStore = create<StatsStore>(() => ({
  hasEnoughDataForStats: (distanceEntries: DistanceEntry[]): boolean => {
    return distanceEntries.length > 0;
  },

  getDateStarted: (distanceEntries: DistanceEntry[]): Date | null => {
    if (distanceEntries.length === 0) return null;
    const oldest = distanceEntries.reduce((min, entry) =>
      entry.date < min.date ? entry : min,
    );
    return new Date(oldest.date);
  },

  getStats: (distanceEntries: DistanceEntry[], miles: number): Stats | null => {
    if (distanceEntries.length === 0) return null;

    const cps = checkpoints as any[];
    const now = new Date();

    // Journey Progress
    // Include first checkpoint (isStart) as always completed
    const checkpointsCompleted =
      cps.filter(
        cp => (cp?.CUMULATIVE_MILES ?? Infinity) <= miles && !cp?.isStart,
      ).length + 1;
    const checkpointsTotal = cps.length;
    const milesCompleted = Math.min(miles, TOTAL_JOURNEY_MILES);
    const milesRemaining = Math.max(0, TOTAL_JOURNEY_MILES - miles);
    const progressPercentage = Math.round((miles / TOTAL_JOURNEY_MILES) * 100);

    // Next checkpoint
    const nextCheckpoint = cps.find(
      cp => (cp?.CUMULATIVE_MILES ?? 0) > miles && !cp?.isStart,
    );
    const milesUntilNextCheckpoint = nextCheckpoint
      ? Math.max(0, (nextCheckpoint.CUMULATIVE_MILES ?? 0) - miles)
      : 0;
    const nextCheckpointName = nextCheckpoint?.name ?? null;

    // Activity stats
    const oldestEntry = distanceEntries.reduce((min, entry) =>
      entry.date < min.date ? entry : min,
    );
    const dateStarted = new Date(oldestEntry.date);

    // Unique active days
    const uniqueDays = new Set(distanceEntries.map(e => getStartOfDay(e.date)));
    const totalActiveDays = uniqueDays.size;

    // Best day
    const dayTotals = new Map<number, number>();
    for (const entry of distanceEntries) {
      const dayStart = getStartOfDay(entry.date);
      dayTotals.set(dayStart, (dayTotals.get(dayStart) || 0) + entry.miles);
    }
    let bestDayMiles = 0;
    let bestDayTimestamp = 0;
    for (const [day, total] of dayTotals) {
      if (total > bestDayMiles) {
        bestDayMiles = total;
        bestDayTimestamp = day;
      }
    }
    const bestDayDate = bestDayTimestamp ? new Date(bestDayTimestamp) : null;

    // Streaks
    const { current: currentStreak, longest: longestStreak } =
      calculateStreaks(distanceEntries);

    // This week/month
    const startOfWeek = getStartOfWeek(now);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    const milesThisWeek = getMilesInRange(
      distanceEntries,
      startOfWeek,
      endOfWeek,
    );

    // Last week
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
    endOfLastWeek.setHours(23, 59, 59, 999);
    const milesLastWeek = getMilesInRange(
      distanceEntries,
      startOfLastWeek,
      endOfLastWeek,
    );

    const startOfMonth = getStartOfMonth(now);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    const milesThisMonth = getMilesInRange(
      distanceEntries,
      startOfMonth,
      endOfMonth,
    );

    // Pace & Projections
    // Count inclusive calendar days between the first entry and today
    // (start-of-day → start-of-day + 1). Using raw timestamp subtraction
    // here previously under-counted: e.g. an entry at 10 PM yesterday +
    // an entry at 6 AM today spans 2 calendar days but only ~8 hours of
    // wall-clock time, which would collapse to totalDays=1 while
    // totalActiveDays=2 — making "excluding missed days" appear lower
    // than the plain daily average.
    const dayStartFirst = getStartOfDay(dateStarted.getTime());
    const dayStartNow = getStartOfDay(now.getTime());
    const totalDays = Math.max(
      1,
      Math.floor((dayStartNow - dayStartFirst) / (24 * 60 * 60 * 1000)) + 1,
    );
    const averageMilesPerDay =
      totalDays > 0 ? Math.round((miles / totalDays) * 10) / 10 : 0;
    const averageMilesPerActiveDay =
      totalActiveDays > 0 ? Math.round((miles / totalActiveDays) * 10) / 10 : 0;

    const estimatedDaysRemaining =
      averageMilesPerDay > 0
        ? Math.ceil(milesRemaining / averageMilesPerDay)
        : 0;

    const estimatedCompletionDate =
      estimatedDaysRemaining > 0
        ? new Date(now.getTime() + estimatedDaysRemaining * 24 * 60 * 60 * 1000)
        : null;

    return {
      journey: {
        checkpointsCompleted,
        checkpointsTotal,
        milesCompleted,
        milesTotalJourney: TOTAL_JOURNEY_MILES,
        milesRemaining,
        milesUntilNextCheckpoint,
        nextCheckpointName,
        progressPercentage,
      },
      activity: {
        dateStarted,
        totalActiveDays,
        bestDayMiles,
        bestDayDate,
        currentStreak,
        longestStreak,
        milesThisWeek,
        milesLastWeek,
        milesThisMonth,
      },
      pace: {
        averageMilesPerDay,
        averageMilesPerActiveDay,
        estimatedDaysRemaining,
        estimatedCompletionDate,
      },
    };
  },
}));
