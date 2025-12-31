import { create } from 'zustand';
import { CheckpointCompletion, TriviaUnlock, PointType } from '../types';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpoints from '../constants/checkpoints.json';
import trivia from '../constants/trivia.json';

interface ProgressStore {
  // State
  miles: number;
  checkpointCompletions: CheckpointCompletion[];
  triviaUnlocks: TriviaUnlock[];
  lastSyncDate: string | null;
  isSyncing: boolean;

  // Actions
  setMiles: (miles: number) => void;
  setCheckpointCompletions: (completions: CheckpointCompletion[]) => void;
  addCheckpointCompletion: (completion: CheckpointCompletion) => void;
  setTriviaUnlocks: (unlocks: TriviaUnlock[]) => void;
  addTriviaUnlock: (unlock: TriviaUnlock) => void;
  setLastSyncDate: (date: string) => void;
  setIsSyncing: (syncing: boolean) => void;
  resetProgress: () => void;

  // Selectors / derived values
  getProgressMiles: () => number;
  getProgressPercentage: () => number;
  getCheckpointIndexForCumulativeMiles: (cumulativeMiles: number) => number;
  // Generic point alias (checkpoint or trivia)
  getIndexForPoint: (item: PointType | null | undefined) => number;
  getCheckpointIndexForMiles: () => number;
  getLatestCompletedCheckpointNumber: () => number; // 1-based
  getCheckpointProgressFor: (checkpointIndex: number) => {
    percentage: number;
    nextCheckpointNumber: number | null;
    milesToNext: number | null;
    spanMiles: number | null;
    currentCumulativeMiles: number | null;
  };
  getRemainingMilesTo: (targetMiles: number) => number;
  isExactlyOnCheckpoint: () => number; // returns exact index or -1
  isLatestCheckpoint: (checkpointIndex: number) => boolean;
  isLockedCheckpoint: (targetMiles: number) => boolean;
  shouldShowCheckpointCelebration: (checkpointIndex: number) => boolean;
  // New selectors
  getCurrentCheckpoint: () => PointType | null;
  getCurrentTrivia: () => PointType | null;
  getActiveInfoItem: () => {
    item: PointType;
    type: 'checkpoint' | 'trivia';
  } | null;

  getPointFromIndex: (
    index: number,
    type?: 'checkpoint' | 'trivia',
  ) => PointType | null;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  // Initial state
  miles: 0,
  checkpointCompletions: [],
  triviaUnlocks: [],
  lastSyncDate: null,
  isSyncing: false,

  // Actions
  setMiles: miles => set({ miles }),
  setCheckpointCompletions: completions =>
    set({ checkpointCompletions: completions }),

  addCheckpointCompletion: completion =>
    set(state => ({
      checkpointCompletions: [...state.checkpointCompletions, completion],
    })),

  setTriviaUnlocks: unlocks => set({ triviaUnlocks: unlocks }),

  addTriviaUnlock: unlock =>
    set(state => ({
      triviaUnlocks: [...state.triviaUnlocks, unlock],
    })),

  setLastSyncDate: date => set({ lastSyncDate: date }),

  setIsSyncing: syncing => set({ isSyncing: syncing }),

  resetProgress: () =>
    set({
      miles: 0,
      checkpointCompletions: [],
      triviaUnlocks: [],
      lastSyncDate: null,
      isSyncing: false,
    }),

  // Selectors / derived values
  getProgressMiles: () => {
    const miles = get().miles ?? 0;
    return Math.max(0, Math.min(miles, TOTAL_JOURNEY_MILES));
  },
  getProgressPercentage: () => {
    const progressMiles = get().getProgressMiles();
    return Math.round((progressMiles / TOTAL_JOURNEY_MILES) * 100);
  },

  getCheckpointIndexForCumulativeMiles: cumulativeMiles => {
    const idx = (checkpoints as any[]).findIndex(
      cp => (cp?.CUMULATIVE_MILES ?? -Infinity) === cumulativeMiles,
    );
    return idx >= 0 ? idx : 0;
  },

  // Generic point index lookup (checkpoint or trivia, by CUMULATIVE_MILES)
  getIndexForPoint: item => {
    if (!item) return -1;
    const cm = Number((item as any)?.CUMULATIVE_MILES ?? NaN);
    if (!Number.isFinite(cm)) return -1;
    const idx = (checkpoints as any[]).findIndex(
      cp => (cp?.CUMULATIVE_MILES ?? -Infinity) === cm,
    );
    return idx >= 0 ? idx : -1;
  },

  getCheckpointIndexForMiles: () => {
    const totalMiles = get().miles ?? 0;
    let byIdx = -1;
    for (let i = 0; i < (checkpoints as any[]).length; i++) {
      const m = (checkpoints as any[])[i]?.CUMULATIVE_MILES ?? 0;
      if (m > 0 && m <= totalMiles) byIdx = i;
    }
    return byIdx; // -1 if none reached yet
  },

  getLatestCompletedCheckpointNumber: () => {
    const completions = get().checkpointCompletions;
    const byCompletions = completions.length
      ? Math.max(...completions.map(c => c.checkpointNumber ?? 0))
      : 0;
    const byIdx = get().getCheckpointIndexForMiles();
    const byMiles = byIdx >= 0 ? byIdx + 1 : 0; // 1-based
    return Math.max(byCompletions, byMiles);
  },

  getCheckpointProgressFor: checkpointIndex => {
    const miles = get().miles ?? 0;
    const cps = checkpoints as any[];
    const nextIdx = checkpointIndex + 1;
    if (checkpointIndex >= 0 && nextIdx < cps.length) {
      const currentCM = cps[checkpointIndex]?.CUMULATIVE_MILES ?? 0;
      const nextCM = cps[nextIdx]?.CUMULATIVE_MILES ?? currentCM;
      const span = Math.max(1, nextCM - currentCM);
      const through = Math.max(0, Math.min(miles - currentCM, span));
      const percentage = Math.round((through / span) * 100);
      const milesToNext = Math.max(0, nextCM - miles);
      return {
        percentage,
        nextCheckpointNumber: nextIdx + 1,
        milesToNext,
        spanMiles: span,
        currentCumulativeMiles: currentCM,
      };
    }
    return {
      percentage: 100,
      nextCheckpointNumber: null,
      milesToNext: null,
      spanMiles: null,
      currentCumulativeMiles: null,
    };
  },

  getRemainingMilesTo: targetMiles => {
    const miles = get().miles ?? 0;
    return Math.max(0, (targetMiles ?? 0) - miles);
  },

  isExactlyOnCheckpoint: () => {
    const miles = get().miles ?? 0;
    const eps = 1e-6;
    const idx = (checkpoints as any[]).findIndex(
      cp => Math.abs((cp?.CUMULATIVE_MILES ?? -Infinity) - miles) < eps,
    );
    return idx >= 0 ? idx : -1;
  },

  isLatestCheckpoint: checkpointIndex => {
    const latest = get().getLatestCompletedCheckpointNumber();
    const currentNumber = checkpointIndex >= 0 ? checkpointIndex + 1 : 0;
    return currentNumber === latest && latest > 1;
  },

  shouldShowCheckpointCelebration: checkpointIndex => {
    // Celebration should run when opening the latest checkpoint by miles (exclude first)
    const latestIdx = get().getCheckpointIndexForMiles();
    return checkpointIndex === latestIdx && latestIdx >= 1;
  },

  isLockedCheckpoint: targetMiles => {
    const miles = get().miles ?? 0;
    return miles < (targetMiles ?? 0);
  },

  // New selectors

  getPointFromIndex: (index, type = 'checkpoint') => {
    if (typeof index !== 'number' || index < 0) return null;
    const src = type === 'trivia' ? (trivia as any[]) : (checkpoints as any[]);
    if (index >= src.length) return null;
    const item = src[index] as PointType;
    return item ? ({ ...(item as PointType), index } as PointType) : null;
  },

  getCurrentCheckpoint: () => {
    const cps = checkpoints as any[];
    const miles = get().miles ?? 0;
    const idx = get().getCheckpointIndexForMiles();
    if (idx >= 0) return (cps[idx] as PointType) ?? null;
    if (miles === 0) {
      const startIdx = cps.findIndex(cp => !!cp?.isStart);
      return startIdx >= 0 ? (cps[startIdx] as PointType) ?? null : null;
    }
    return null;
  },

  getCurrentTrivia: () => {
    const miles = get().miles ?? 0;
    const eps = 1e-6;
    const items = trivia as any[];
    for (const t of items) {
      const activationMiles = Number(t?.CUMULATIVE_MILES ?? -Infinity);
      if (Math.abs(miles - activationMiles) < eps) {
        return (t as PointType) ?? null;
      }
    }
    return null;
  },

  getActiveInfoItem: () => {
    const currentTrivia = get().getCurrentTrivia();
    const exactlyOnCheckpoint = get().isExactlyOnCheckpoint() !== -1;
    if (currentTrivia && !exactlyOnCheckpoint) {
      const items = trivia as any[];
      const tMiles = currentTrivia?.CUMULATIVE_MILES ?? -Infinity;
      const tIdx = items.findIndex(
        it => (it?.CUMULATIVE_MILES ?? -Infinity) === tMiles,
      );
      const enriched = {
        ...(currentTrivia as PointType),
        index: tIdx >= 0 ? tIdx : undefined,
      } as PointType;
      return { item: enriched, type: 'trivia' };
    }
    const currentCheckpoint = get().getCurrentCheckpoint();
    if (currentCheckpoint) {
      const cps = checkpoints as any[];
      const cMiles = currentCheckpoint?.CUMULATIVE_MILES ?? -Infinity;
      const cIdx = cps.findIndex(
        it => (it?.CUMULATIVE_MILES ?? -Infinity) === cMiles,
      );
      const enriched = {
        ...(currentCheckpoint as PointType),
        index: cIdx >= 0 ? cIdx : undefined,
      } as PointType;
      return { item: enriched, type: 'checkpoint' };
    }
    return null;
  },
}));
