import { create } from 'zustand';
import { CheckpointCompletion, TriviaUnlock } from '../types';

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
}

export const useProgressStore = create<ProgressStore>(set => ({
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
}));
