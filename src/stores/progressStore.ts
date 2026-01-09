import { create } from 'zustand';
import { TriviaUnlock, PointType, DistanceEntry } from '../types';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpoints from '../constants/checkpoints.json';
import trivia from '../constants/trivia.json';
import { database } from '../services/database';

const SAVE_ID = 'default';

interface ProgressStore {
  // State
  miles: number;
  triviaUnlocks: TriviaUnlock[];
  distanceEntries: DistanceEntry[];
  lastSyncDate: string | null;
  isSyncing: boolean;
  syncMessage: string | null; // Message to show during sync (e.g., "+0.5 miles")
  syncError: string | null; // Error message when sync fails (e.g., permissions lost)
  // Dev/test override state
  isTestOverride: boolean;
  testOverrideBaseMiles: number | null;

  // Initialization (loads from database)
  initFromDatabase: () => Promise<void>;

  // Actions (persist to database automatically)
  setMiles: (miles: number) => void;
  setTestMiles: (miles: number) => void;
  clearTestOverride: () => void;
  setTriviaUnlocks: (unlocks: TriviaUnlock[]) => void;
  addTriviaUnlock: (unlock: TriviaUnlock) => void;
  addDistanceEntry: (entry: DistanceEntry) => Promise<void>;
  updateDistanceEntry: (entry: DistanceEntry) => Promise<void>;
  removeDistanceEntry: (id: string) => Promise<void>;
  setDistanceEntries: (entries: DistanceEntry[]) => void;
  setLastSyncDate: (date: string) => void;
  setIsSyncing: (syncing: boolean) => void;
  setSyncMessage: (message: string | null) => void;
  setSyncError: (error: string | null) => void;
  resetProgress: () => Promise<void>;
  persistMilesSnapshot: () => Promise<void>;

  // Selectors / derived values
  getProgressMiles: () => number;
  getProgressPercentage: () => number;
  getCheckpointIndexForMiles: () => number;
  getLatestCompletedCheckpointNumber: () => number; // 1-based
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
  getNextCheckpointAfterMiles: (miles: number) => PointType | null;
  // Trivia in previous segment between checkpoints[currentIndex-1] and checkpoints[currentIndex]
  getPreviousTrivia: (currentIndex: number) => PointType[];
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  // Initial state
  miles: 0,
  triviaUnlocks: [],
  distanceEntries: [],
  lastSyncDate: null,
  isSyncing: false,
  syncMessage: null,
  syncError: null,
  isTestOverride: false,
  testOverrideBaseMiles: null,

  // Initialize from database on app start
  initFromDatabase: async () => {
    try {
      const snapshot = await database.getMilesSnapshot(SAVE_ID);
      const entries = await database.getDistanceEntries(SAVE_ID);

      if (snapshot !== null) {
        set({ miles: snapshot, distanceEntries: entries });
      } else {
        // No snapshot, calculate from entries
        const totalMiles = (entries || []).reduce(
          (sum, e) => sum + (e?.miles ?? 0),
          0,
        );
        set({ miles: totalMiles, distanceEntries: entries });
        await database.setMilesSnapshot(SAVE_ID, totalMiles);
      }
    } catch (error) {
      console.error('Failed to init progress from database:', error);
    }
  },

  // Actions
  setMiles: miles => set({ miles }),
  setTestMiles: miles =>
    set(state => ({
      miles,
      isTestOverride: true,
      testOverrideBaseMiles:
        state.isTestOverride && typeof state.testOverrideBaseMiles === 'number'
          ? state.testOverrideBaseMiles
          : state.miles ?? 0,
    })),
  clearTestOverride: () =>
    set({ isTestOverride: false, testOverrideBaseMiles: null }),

  setTriviaUnlocks: unlocks => set({ triviaUnlocks: unlocks }),

  addTriviaUnlock: unlock =>
    set(state => ({
      triviaUnlocks: [...state.triviaUnlocks, unlock],
    })),

  addDistanceEntry: async entry => {
    const state = get();
    // Check for duplicate
    if (state.distanceEntries.some(e => e.id === entry.id)) {
      return; // Already exists
    }

    // Update store with new entry AND increment miles snapshot
    set({
      distanceEntries: [entry, ...state.distanceEntries],
      miles: state.miles + entry.miles,
    });

    // Persist to database
    try {
      await database.addDistanceEntry({
        id: entry.id,
        saveId: entry.saveId || SAVE_ID,
        date: entry.date as number,
        miles: entry.miles,
        source: entry.source,
      });
    } catch (error) {
      console.error('Failed to persist distance entry:', error);
    }
  },

  updateDistanceEntry: async entry => {
    const state = get();
    const oldEntry = state.distanceEntries.find(e => e.id === entry.id);
    const milesDelta = oldEntry ? entry.miles - oldEntry.miles : 0;

    // Update store with entry change AND adjust miles snapshot
    set({
      distanceEntries: state.distanceEntries.map(e =>
        e.id === entry.id ? entry : e,
      ),
      miles: state.miles + milesDelta,
    });

    // Persist to database
    try {
      await database.addDistanceEntry({
        id: entry.id,
        saveId: entry.saveId || SAVE_ID,
        date: entry.date as number,
        miles: entry.miles,
        source: entry.source,
      });
    } catch (error) {
      console.error('Failed to update distance entry:', error);
    }
  },

  removeDistanceEntry: async id => {
    const state = get();
    const entryToRemove = state.distanceEntries.find(e => e.id === id);
    const milesToRemove = entryToRemove?.miles ?? 0;

    // Update store with entry removed AND decrement miles snapshot
    set({
      distanceEntries: state.distanceEntries.filter(d => d.id !== id),
      miles: Math.max(0, state.miles - milesToRemove),
    });

    // Persist to database
    try {
      await database.removeDistanceEntry(id);
    } catch (error) {
      console.error('Failed to remove distance entry:', error);
    }
  },

  setDistanceEntries: entries => set({ distanceEntries: entries }),

  setLastSyncDate: date => set({ lastSyncDate: date }),

  setIsSyncing: syncing => set({ isSyncing: syncing }),

  setSyncMessage: message => set({ syncMessage: message }),

  setSyncError: error => set({ syncError: error }),

  persistMilesSnapshot: async () => {
    const miles = get().miles;
    try {
      await database.setMilesSnapshot(SAVE_ID, miles);
    } catch (error) {
      console.error('Failed to persist miles snapshot:', error);
    }
  },

  resetProgress: async () => {
    set({
      miles: 0,
      triviaUnlocks: [],
      distanceEntries: [],
      lastSyncDate: null,
      isSyncing: false,
      syncError: null,
      isTestOverride: false,
      testOverrideBaseMiles: null,
    });

    // Clear database
    try {
      await database.setMilesSnapshot(SAVE_ID, 0);
      // Note: Would need to add a clearDistanceEntries method to database
    } catch (error) {
      console.error('Failed to reset database:', error);
    }
  },

  // Selectors / derived values
  getProgressMiles: () => {
    const miles = get().miles ?? 0;
    return Math.max(0, Math.min(miles, TOTAL_JOURNEY_MILES));
  },
  getProgressPercentage: () => {
    const progressMiles = get().getProgressMiles();
    return Math.round((progressMiles / TOTAL_JOURNEY_MILES) * 100);
  },

  // Removed unused selectors: getCheckpointIndexForCumulativeMiles, getIndexForPoint

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
    const byIdx = get().getCheckpointIndexForMiles();
    return byIdx >= 0 ? byIdx + 1 : 0; // 1-based
  },

  // Removed unused selector: getCheckpointProgressFor

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

  getNextCheckpointAfterMiles: miles => {
    const cps = checkpoints as any[];
    for (let i = 0; i < cps.length; i++) {
      const cpMiles = Number(cps[i]?.CUMULATIVE_MILES ?? NaN);
      if (Number.isFinite(cpMiles) && cpMiles > miles) {
        return { ...(cps[i] as PointType), index: i } as PointType;
      }
    }
    return null; // No checkpoint after this miles value
  },

  getPreviousTrivia: currentIndex => {
    const cps = checkpoints as any[];
    const trs = trivia as any[];
    const idx = Number(currentIndex);
    if (!Number.isFinite(idx) || idx <= 0 || idx >= cps.length) return [];
    const prevMiles = Number(cps[idx - 1]?.CUMULATIVE_MILES ?? NaN);
    const currMiles = Number(cps[idx]?.CUMULATIVE_MILES ?? NaN);
    if (!Number.isFinite(prevMiles) || !Number.isFinite(currMiles)) return [];
    const results: PointType[] = [];
    for (const t of trs) {
      const m = Number((t as any)?.CUMULATIVE_MILES ?? NaN);
      if (!Number.isFinite(m)) continue;
      if (m <= prevMiles) continue;
      if (m >= currMiles) break; // trivia assumed sorted ascending by miles
      results.push(t as PointType);
    }
    return results;
  },

  getCurrentCheckpoint: () => {
    const cps = checkpoints as any[];
    const miles = get().miles ?? 0;
    const eps = 1e-6;
    // Only return a checkpoint if we're exactly on it
    const idx = cps.findIndex(
      cp => Math.abs((cp?.CUMULATIVE_MILES ?? -Infinity) - miles) < eps,
    );
    if (idx >= 0) return (cps[idx] as PointType) ?? null;
    // Also show starting checkpoint if at 0 miles
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
