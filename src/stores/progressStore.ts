import { create } from 'zustand';
import { CheckpointCompletion, TriviaUnlock } from '../types';
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
  getSegmentTriviaForCheckpointIndex: (checkpointIndex: number) => any[];
  isLockedCheckpoint: (targetMiles: number) => boolean;
  shouldShowCheckpointCelebration: (checkpointIndex: number) => boolean;
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

  getSegmentTriviaForCheckpointIndex: checkpointIndex => {
    const cps = checkpoints as any[];
    const currentCM = cps[checkpointIndex]?.CUMULATIVE_MILES ?? 0;
    const prevCM =
      checkpointIndex > 0
        ? cps[checkpointIndex - 1]?.CUMULATIVE_MILES ?? 0
        : -Infinity;
    const items = (trivia as any[]).filter(t => {
      const mile = Number(t?.CUMULATIVE_MILES ?? -Infinity);
      return mile > prevCM && mile <= currentCM;
    });
    items.sort(
      (a, b) =>
        Number(a?.CUMULATIVE_MILES ?? 0) - Number(b?.CUMULATIVE_MILES ?? 0),
    );
    return items;
  },

  isLockedCheckpoint: targetMiles => {
    const miles = get().miles ?? 0;
    return miles < (targetMiles ?? 0);
  },
}));
