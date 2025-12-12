import { create } from 'zustand';
import { CheckpointCompletion, TriviaUnlock } from '../types';

interface ProgressStore {
  // State
  checkpointCompletions: CheckpointCompletion[];
  triviaUnlocks: TriviaUnlock[];
  lastSyncDate: string | null;
  isSyncing: boolean;

  // Actions
  setCheckpointCompletions: (completions: CheckpointCompletion[]) => void;
  addCheckpointCompletion: (completion: CheckpointCompletion) => void;
  setTriviaUnlocks: (unlocks: TriviaUnlock[]) => void;
  addTriviaUnlock: (unlock: TriviaUnlock) => void;
  setLastSyncDate: (date: string) => void;
  setIsSyncing: (syncing: boolean) => void;
  resetProgress: () => void;
}

export const useProgressStore = create<ProgressStore>((set) => ({
  // Initial state
  checkpointCompletions: [],
  triviaUnlocks: [],
  lastSyncDate: null,
  isSyncing: false,

  // Actions
  setCheckpointCompletions: (completions) =>
    set({ checkpointCompletions: completions }),

  addCheckpointCompletion: (completion) =>
    set((state) => ({
      checkpointCompletions: [...state.checkpointCompletions, completion],
    })),

  setTriviaUnlocks: (unlocks) => set({ triviaUnlocks: unlocks }),

  addTriviaUnlock: (unlock) =>
    set((state) => ({
      triviaUnlocks: [...state.triviaUnlocks, unlock],
    })),

  setLastSyncDate: (date) => set({ lastSyncDate: date }),

  setIsSyncing: (syncing) => set({ isSyncing: syncing }),

  resetProgress: () =>
    set({
      checkpointCompletions: [],
      triviaUnlocks: [],
      lastSyncDate: null,
      isSyncing: false,
    }),
}));
