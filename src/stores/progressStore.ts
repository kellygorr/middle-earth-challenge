import { create } from 'zustand';
import {
  TriviaUnlock,
  PointType,
  DistanceEntry,
  DistanceSource,
} from '../types';
import {
  TOTAL_JOURNEY_MILES,
  DEFAULT_SAVE_ID,
} from '../constants/gameConstants';
import checkpointsRaw from '../constants/checkpoints.json';
import triviaRaw from '../constants/trivia.json';
import {
  database,
  type DistanceEntryChanges,
  type ProgressMutation,
} from '../services/database';
import {
  LONG_SYNC_CHUNK_THRESHOLD,
  LONG_SYNC_TIME_THRESHOLD_MS,
} from '../constants/sync';
import {
  supersededTroubleshootingIssueSlots,
  troubleshootingIssueSlot,
  type TroubleshootingIssueSlot,
} from '../constants/troubleshootingIssues';

// The JSON files are hand-authored PointType-shaped rows. Cast once at
// import time so the rest of this module can drop the per-call
// `as any[]` sprinkled across selectors.
const checkpoints = checkpointsRaw as PointType[];
const trivia = triviaRaw as PointType[];

const SAVE_ID = DEFAULT_SAVE_ID;

export function applyCommittedEntryChanges(
  entries: DistanceEntry[],
  changes: DistanceEntryChanges,
): DistanceEntry[] {
  const removeIds = new Set(changes.removeIds ?? []);
  const removeSources = new Set(changes.removeSources ?? []);
  const byId = new Map(
    (changes.clearAll ? [] : entries)
      .filter(
        entry => !removeIds.has(entry.id) && !removeSources.has(entry.source),
      )
      .map(entry => [entry.id, entry]),
  );
  for (const entry of changes.upsert ?? []) byId.set(entry.id, entry);
  return [...byId.values()].sort((left, right) => left.date - right.date);
}

const publishProgressMutation = (
  set: (updater: (state: ProgressStore) => Partial<ProgressStore>) => void,
  progress: ProgressMutation,
) => {
  set(state => ({
    distanceEntries: applyCommittedEntryChanges(
      state.distanceEntries,
      progress.changes,
    ),
    miles: progress.miles,
    steps: progress.steps,
  }));
};

/**
 * Discriminated error kinds surfaced by the sync pipeline.
 * `permission` mirrors the existing disconnect message; the rest are new with chunked sync.
 *
 * `unknown` is intentionally NOT surfaced to the user (no banner, no badge)
 * — only logged. It exists so we can carry the raw message through to
 * diagnostics without claiming we know what to do about it. See
 * `setSyncStatus` below: the store deliberately ignores `unknown` when
 * populating `lastSyncError`.
 */
export type SyncError =
  | {
      kind: 'permission';
      /**
       * Which sync source the missing permission belongs to. Drives
       * copy + action in `SyncErrorBanner` (e.g. Physical Activity for
       * pedometer vs. Health Connect access for health-app). Only ever
       * set for the currently-selected source, so we never nag users
       * about permissions on a source they aren't using.
       */
      source: 'health-app' | 'pedometer' | 'both';
      message: string;
    }
  | {
      kind: 'sourceFallback';
      unavailableSource: 'health-app' | 'pedometer';
      activeSource: 'health-app' | 'pedometer';
    }
  | {
      kind: 'timeout';
      chunkStart: number;
      chunkEnd: number;
      chunksDone: number;
      chunksTotal: number;
    }
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'provider';
      provider: 'health-connect' | 'apple-health';
      message: string;
    }
  | { kind: 'pedometerStorage'; message: string }
  /**
   * The step service was down long enough to have cost steps. Nothing was
   * written natively for that window, so those steps are unrecoverable and the
   * card offers manual entry.
   */
  | {
      kind: 'pedometerServiceStopped';
      lastCommitAt: number;
      staleForMs: number;
      manufacturer: string;
    }
  | { kind: 'unknown'; message: string };

export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'error';
  chunksDone: number;
  chunksTotal: number;
  milesAdded: number;
  startedAt: number | null;
  lastProgressAt: number | null;
  error: SyncError | null;
}

export const initialSyncStatus: SyncStatus = {
  phase: 'idle',
  chunksDone: 0,
  chunksTotal: 0,
  milesAdded: 0,
  startedAt: null,
  lastProgressAt: null,
  error: null,
};

export interface TroubleshootingIssue {
  error: SyncError;
  /** Wall-clock time the issue was last observed. */
  at: number;
  /**
   * Set when the user swipes the card away. The issue is kept rather than
   * deleted so an accidental dismissal is recoverable, and so history can
   * show what the user did about it.
   */
  dismissedAt: number | null;
  /**
   * Set when something re-checked the condition and found it gone. Only ever
   * written by a real re-check, never on a timer or at app start, so the app
   * cannot claim health it has not verified.
   */
  resolvedAt: number | null;
}

/**
 * Advisory data, so this is deliberately fire-and-forget with centralized
 * logging rather than an awaited transactional command: a failed write must
 * not break a sync or block the UI, and the worst case is a lost history row.
 */
const persistTroubleshootingIssues = (issues: TroubleshootingIssue[]): void => {
  database
    .saveTroubleshootingIssues(
      issues.map(issue => ({
        slot: troubleshootingIssueSlot(issue.error),
        error: issue.error,
        at: issue.at,
        dismissedAt: issue.dismissedAt,
        resolvedAt: issue.resolvedAt,
      })),
    )
    .catch(error => {
      console.warn('[progress] could not save tracking issue history', error);
    });
};

const mergeTroubleshootingIssue = (
  issues: TroubleshootingIssue[],
  error: SyncError,
): TroubleshootingIssue[] => {
  const replaced = supersededTroubleshootingIssueSlots(error);
  const slot = troubleshootingIssueSlot(error);
  const previous = issues.find(
    issue => troubleshootingIssueSlot(issue.error) === slot,
  );
  return [
    ...issues.filter(
      issue => !replaced.includes(troubleshootingIssueSlot(issue.error)),
    ),
    {
      error,
      at: Date.now(),
      // Dismissal is sticky across re-detections of the SAME fault. Several of
      // these are the result of a deliberate choice made outside the app --
      // revoking Health Connect access, for instance -- so re-raising the card
      // every time we notice again would be nagging the user about a decision
      // they already made. Keyed on kind rather than slot so a different fault
      // in the same subsystem is still shown.
      dismissedAt:
        previous?.error.kind === error.kind ? previous.dismissedAt : null,
      // A recurrence proves it is not fixed after all.
      resolvedAt: null,
    },
  ];
};

interface ProgressStore {
  // State
  miles: number;
  /**
   * Running total of committed steps (SUM of `distance_entries.steps`),
   * mirrored from `progress_snapshot.steps` so hot-path reads don't
   * have to reduce the entries array on every render. Kept in sync by
   * the same writers that update `miles`.
   *
   * NOTE: This is the *closed-range* total only. Live pedometer
   * activity since `lastSyncTimestamp` is a separate concern owned by
   * MapScreen (queried directly from `pedometerService`).
   */
  steps: number;
  triviaUnlocks: TriviaUnlock[];
  distanceEntries: DistanceEntry[];
  lastSyncDate: string | null;
  syncStatus: SyncStatus;
  /**
   * Persisted troubleshooting issues (until dismissed) so they remain discoverable
   * after the transient pill fades. At most one entry per slot, because
   * failures cascade within a subsystem but are independent across them --
   * see `src/constants/troubleshootingIssues.ts`.
   */
  troubleshootingIssues: TroubleshootingIssue[];
  // Dev/test override state
  testOverrideMiles: number | null;

  // Initialization (loads from database)
  initFromDatabase: () => Promise<void>;

  // Actions (persist to database automatically)
  setTestMiles: (miles: number) => void;
  clearTestOverride: () => void;
  setTriviaUnlocks: (unlocks: TriviaUnlock[]) => void;
  addTriviaUnlock: (unlock: TriviaUnlock) => void;
  addDistanceEntry: (entry: DistanceEntry) => Promise<void>;
  addDistanceEntries: (entries: DistanceEntry[]) => Promise<void>;
  applyDistanceEntryChanges: (changes: {
    upsert?: DistanceEntry[];
    removeIds?: string[];
  }) => Promise<void>;
  applyHealthSyncChunk: (
    entries: DistanceEntry[],
    cursor: number,
    healthSyncFormatVersion: number,
    healthLookbackStartTimestamp: number | null,
  ) => Promise<boolean>;
  applyPedometerSyncChunk: (
    entries: DistanceEntry[],
    cursor: number,
    expectedPedometerCursor?: import('../types').PedometerCursor | null,
    nextPedometerCursor?: import('../types').PedometerCursor | null,
  ) => Promise<boolean>;
  applyHealthReconciliationDay: (
    changes: { upsert?: DistanceEntry[]; removeIds?: string[] },
    cursor: number,
  ) => Promise<boolean>;
  updateDistanceEntry: (entry: DistanceEntry) => Promise<void>;
  removeDistanceEntry: (id: string) => Promise<void>;
  removeDistanceEntriesBySource: (sources: DistanceSource[]) => Promise<void>;
  setLastSyncDate: (date: string) => void;
  setSyncStatus: (
    status: SyncStatus | ((prev: SyncStatus) => SyncStatus),
  ) => void;
  resetSyncStatus: () => void;
  /** Record an issue, replacing any it supersedes. */
  addTroubleshootingIssue: (error: SyncError) => void;
  /** User swiped the card away; kept in history so it can be re-raised. */
  dismissTroubleshootingIssue: (slot: TroubleshootingIssueSlot) => void;
  /** Bring a dismissed issue back to the banner, from history. */
  restoreTroubleshootingIssue: (slot: TroubleshootingIssueSlot) => void;
  /**
   * The underlying condition was re-checked and found gone. Only applies to
   * active issues: a closed one represents a decision the user made, so
   * relabelling it behind their back would both rewrite that record and take
   * away its Reopen action. Reopening re-checks explicitly.
   */
  resolveTroubleshootingIssue: (slot: TroubleshootingIssueSlot) => void;
  clearAllTroubleshootingIssues: () => void;
  resetProgress: () => Promise<void>;
  persistMilesSnapshot: () => Promise<void>;

  // Selectors / derived values
  getDisplayMiles: () => number;
  getProgressMiles: () => number;
  getProgressPercentage: () => number;
  getTotalMiles: () => number;
  getTotalSteps: () => number;
  getCheckpointIndexForMiles: () => number;
  getLatestCompletedCheckpointNumber: () => number; // 1-based
  getRemainingMilesTo: (targetMiles: number) => number;
  isExactlyOnCheckpoint: () => number; // returns exact index or -1
  isLatestCheckpoint: (checkpointIndex: number) => boolean;
  isLockedCheckpoint: (targetMiles: number) => boolean;
  isNextLockedCheckpoint: (targetMiles: number) => boolean;
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
  steps: 0,
  triviaUnlocks: [],
  distanceEntries: [],
  lastSyncDate: null,
  syncStatus: initialSyncStatus,
  troubleshootingIssues: [],
  testOverrideMiles: null,

  // Initialize from database on app start
  initFromDatabase: async () => {
    const progress = await database.hydrateProgress(SAVE_ID);
    set({
      miles: progress.miles,
      steps: progress.steps,
      distanceEntries: progress.entries,
    });

    // Advisory data, so a failure here must not block hydration of the
    // journey itself.
    try {
      const stored = await database.loadTroubleshootingIssues();
      set({ troubleshootingIssues: stored as TroubleshootingIssue[] });
    } catch (error) {
      console.warn('[progress] could not load tracking issue history', error);
    }
  },

  // Actions
  setTestMiles: miles => set({ testOverrideMiles: miles }),
  clearTestOverride: () => set({ testOverrideMiles: null }),

  setTriviaUnlocks: unlocks => set({ triviaUnlocks: unlocks }),

  addTriviaUnlock: unlock =>
    set(state => ({
      triviaUnlocks: [...state.triviaUnlocks, unlock],
    })),

  addDistanceEntry: async entry => {
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      upsert: [entry],
    });
    publishProgressMutation(set, progress);
  },

  /**
   * Bulk-add new distance entries: one store update, one DB transaction.
   * Filters out duplicates by id against current entries. Caller is
   * expected to have already deduped against the same chunk if needed.
   */
  addDistanceEntries: async entries => {
    if (entries.length === 0) return;
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      upsert: entries,
    });
    publishProgressMutation(set, progress);
  },

  applyDistanceEntryChanges: async changes => {
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, changes);
    publishProgressMutation(set, progress);
  },

  applyHealthSyncChunk: async (
    entries,
    cursor,
    healthSyncFormatVersion,
    healthLookbackStartTimestamp,
  ) => {
    const progress = await database.applyHealthSyncChunk(
      SAVE_ID,
      entries,
      cursor,
      healthSyncFormatVersion,
      healthLookbackStartTimestamp,
    );
    if (progress.applied) publishProgressMutation(set, progress);
    return progress.applied;
  },

  applyPedometerSyncChunk: async (
    entries,
    cursor,
    expectedPedometerCursor,
    nextPedometerCursor,
  ) => {
    const progress = await database.applyPedometerSyncChunk(
      SAVE_ID,
      entries,
      cursor,
      expectedPedometerCursor,
      nextPedometerCursor,
    );
    if (progress.applied) publishProgressMutation(set, progress);
    return progress.applied;
  },

  applyHealthReconciliationDay: async (changes, cursor) => {
    const progress = await database.applyHealthReconciliationDay(
      SAVE_ID,
      changes,
      cursor,
    );
    if (progress.applied) publishProgressMutation(set, progress);
    return progress.applied;
  },

  updateDistanceEntry: async entry => {
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      upsert: [entry],
    });
    publishProgressMutation(set, progress);
  },

  removeDistanceEntry: async id => {
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      removeIds: [id],
    });
    publishProgressMutation(set, progress);
  },

  /**
   * Bulk-remove every distance entry whose source is in `sources`.
   * Uses a single setState + a single SQL DELETE + a single miles snapshot
   * write, so "delete synced data" / "delete manual data" from Settings
   * doesn't freeze the UI for users with hundreds/thousands of entries.
   */
  removeDistanceEntriesBySource: async sources => {
    if (sources.length === 0) return;
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      removeSources: sources,
    });
    publishProgressMutation(set, progress);
  },

  setLastSyncDate: date => set({ lastSyncDate: date }),

  setSyncStatus: status =>
    set(state => {
      const next =
        typeof status === 'function' ? status(state.syncStatus) : status;
      // Capture the latest error so it remains discoverable in Settings
      // after the transient pill has faded. `unknown` is intentionally
      // skipped: if we can't tell the user something useful, we don't
      // pop a banner or a badge — we only log it (the caller already does).
      if (
        next.phase === 'error' &&
        next.error &&
        next.error.kind !== 'unknown'
      ) {
        const troubleshootingIssues = mergeTroubleshootingIssue(
          state.troubleshootingIssues,
          next.error,
        );
        persistTroubleshootingIssues(troubleshootingIssues);
        return { syncStatus: next, troubleshootingIssues };
      }
      // Clear on success: phase=='idle' is only set by the success branch
      // in useSyncInterval (initial state and resetSyncStatus take other
      // code paths). Clearing here avoids the badge flicker that would
      // happen if we cleared on 'syncing' and the retry itself failed.
      // Scoped to health-app: a successful health sync says nothing about
      // whether the pedometer is still broken.
      if (next.phase === 'idle' && state.troubleshootingIssues.length > 0) {
        const troubleshootingIssues = state.troubleshootingIssues.map(issue =>
          troubleshootingIssueSlot(issue.error) === 'health-app' &&
          issue.resolvedAt === null &&
          issue.dismissedAt === null
            ? { ...issue, resolvedAt: Date.now() }
            : issue,
        );
        persistTroubleshootingIssues(troubleshootingIssues);
        return { syncStatus: next, troubleshootingIssues };
      }
      return { syncStatus: next };
    }),

  resetSyncStatus: () => set({ syncStatus: initialSyncStatus }),

  addTroubleshootingIssue: error =>
    set(state => {
      const troubleshootingIssues = mergeTroubleshootingIssue(
        state.troubleshootingIssues,
        error,
      );
      persistTroubleshootingIssues(troubleshootingIssues);
      return { troubleshootingIssues };
    }),

  dismissTroubleshootingIssue: slot =>
    set(state => {
      const troubleshootingIssues = state.troubleshootingIssues.map(issue =>
        troubleshootingIssueSlot(issue.error) === slot &&
        issue.dismissedAt === null
          ? { ...issue, dismissedAt: Date.now() }
          : issue,
      );
      persistTroubleshootingIssues(troubleshootingIssues);
      return { troubleshootingIssues };
    }),

  restoreTroubleshootingIssue: slot =>
    set(state => {
      const troubleshootingIssues = state.troubleshootingIssues.map(issue =>
        troubleshootingIssueSlot(issue.error) === slot
          ? { ...issue, dismissedAt: null }
          : issue,
      );
      persistTroubleshootingIssues(troubleshootingIssues);
      return { troubleshootingIssues };
    }),

  resolveTroubleshootingIssue: slot =>
    set(state => {
      const troubleshootingIssues = state.troubleshootingIssues.map(issue =>
        troubleshootingIssueSlot(issue.error) === slot &&
        issue.resolvedAt === null &&
        issue.dismissedAt === null
          ? { ...issue, resolvedAt: Date.now() }
          : issue,
      );
      persistTroubleshootingIssues(troubleshootingIssues);
      return { troubleshootingIssues };
    }),

  clearAllTroubleshootingIssues: () =>
    set(state => {
      persistTroubleshootingIssues([]);
      return {
        troubleshootingIssues: [],
        // Also reset syncStatus if it's still stuck in the error phase, so
        // anything reading syncStatus.phase (e.g. dev tools, indicators)
        // doesn't show the error as still active after the user dismissed it.
        syncStatus:
          state.syncStatus.phase === 'error'
            ? initialSyncStatus
            : state.syncStatus,
      };
    }),

  persistMilesSnapshot: async () => {
    const progress = await database.reconcileProgress(SAVE_ID);
    set({
      miles: progress.miles,
      steps: progress.steps,
    });
  },

  resetProgress: async () => {
    const progress = await database.applyDistanceEntryChanges(SAVE_ID, {
      clearAll: true,
    });
    set(state => ({
      miles: progress.miles,
      steps: progress.steps,
      triviaUnlocks: [],
      distanceEntries: applyCommittedEntryChanges(
        state.distanceEntries,
        progress.changes,
      ),
      lastSyncDate: null,
      syncStatus: initialSyncStatus,
      troubleshootingIssues: [],
      testOverrideMiles: null,
    }));
  },

  // Selectors / derived values
  getDisplayMiles: () => get().testOverrideMiles ?? get().miles ?? 0,
  getProgressMiles: () => {
    const miles = get().getDisplayMiles();
    return Math.max(0, Math.min(miles, TOTAL_JOURNEY_MILES));
  },
  getProgressPercentage: () => {
    const progressMiles = get().getProgressMiles();
    return Math.round((progressMiles / TOTAL_JOURNEY_MILES) * 100);
  },

  // These return the committed snapshot totals. The snapshot is a cache of
  // the authoritative distance-entry sums and is updated in the same
  // transaction as every entry mutation.
  getTotalMiles: () => get().miles,
  getTotalSteps: () => get().steps,

  // Removed unused selectors: getCheckpointIndexForCumulativeMiles, getIndexForPoint

  getCheckpointIndexForMiles: () => {
    const totalMiles = get().getDisplayMiles();
    let byIdx = -1;
    for (let i = 0; i < checkpoints.length; i++) {
      const m = checkpoints[i]?.CUMULATIVE_MILES ?? 0;
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
    const miles = get().getDisplayMiles();
    return Math.max(0, (targetMiles ?? 0) - miles);
  },

  isExactlyOnCheckpoint: () => {
    const miles = get().getDisplayMiles();
    const eps = 1e-6;
    const idx = checkpoints.findIndex(
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
    const miles = get().getDisplayMiles();
    return miles < (targetMiles ?? 0);
  },

  // Whether this is the single *immediate* next locked checkpoint — the
  // closest one still ahead — as opposed to any other locked checkpoint
  // further down the road. Used to give just that one checkpoint a distinct
  // highlight (map dot color, info-modal accent) instead of the generic
  // locked treatment every other future checkpoint gets. `checkpoints` is
  // ascending by CUMULATIVE_MILES, so the first one still ahead of the
  // traveler is unambiguous.
  isNextLockedCheckpoint: targetMiles => {
    const miles = get().getDisplayMiles();
    const nextIdx = checkpoints.findIndex(
      cp => (cp?.CUMULATIVE_MILES ?? 0) > miles,
    );
    return (
      nextIdx >= 0 && checkpoints[nextIdx]?.CUMULATIVE_MILES === targetMiles
    );
  },

  // New selectors

  getPointFromIndex: (index, type = 'checkpoint') => {
    if (typeof index !== 'number' || index < 0) return null;
    const src = type === 'trivia' ? trivia : checkpoints;
    if (index >= src.length) return null;
    const item = src[index];
    return item ? ({ ...item, index } as PointType) : null;
  },

  getNextCheckpointAfterMiles: miles => {
    const cps = checkpoints;
    for (let i = 0; i < cps.length; i++) {
      const cpMiles = Number(cps[i]?.CUMULATIVE_MILES ?? NaN);
      if (Number.isFinite(cpMiles) && cpMiles > miles) {
        return { ...cps[i], index: i } as PointType;
      }
    }
    return null; // No checkpoint after this miles value
  },

  getPreviousTrivia: currentIndex => {
    const cps = checkpoints;
    const trs = trivia;
    const idx = Number(currentIndex);
    if (!Number.isFinite(idx) || idx <= 0 || idx >= cps.length) return [];
    const prevMiles = Number(cps[idx - 1]?.CUMULATIVE_MILES ?? NaN);
    const currMiles = Number(cps[idx]?.CUMULATIVE_MILES ?? NaN);
    if (!Number.isFinite(prevMiles) || !Number.isFinite(currMiles)) return [];
    const results: PointType[] = [];
    for (const t of trs) {
      const m = Number(t?.CUMULATIVE_MILES ?? NaN);
      if (!Number.isFinite(m)) continue;
      if (m <= prevMiles) continue;
      if (m >= currMiles) break; // trivia assumed sorted ascending by miles
      results.push(t);
    }
    return results;
  },

  getCurrentCheckpoint: () => {
    const cps = checkpoints;
    const miles = get().getDisplayMiles();
    const eps = 1e-6;
    // Only return a checkpoint if we're exactly on it
    const idx = cps.findIndex(
      cp => Math.abs((cp?.CUMULATIVE_MILES ?? -Infinity) - miles) < eps,
    );
    if (idx >= 0) return cps[idx] ?? null;
    // Also show starting checkpoint if at 0 miles
    if (miles === 0) {
      const startIdx = cps.findIndex(cp => !!cp?.isStart);
      return startIdx >= 0 ? cps[startIdx] ?? null : null;
    }
    return null;
  },

  getCurrentTrivia: () => {
    const miles = get().getDisplayMiles();
    const eps = 1e-6;
    const items = trivia;
    for (const t of items) {
      const activationMiles = Number(t?.CUMULATIVE_MILES ?? -Infinity);
      if (Math.abs(miles - activationMiles) < eps) {
        return t ?? null;
      }
    }
    return null;
  },

  getActiveInfoItem: () => {
    const currentTrivia = get().getCurrentTrivia();
    const exactlyOnCheckpoint = get().isExactlyOnCheckpoint() !== -1;
    if (currentTrivia && !exactlyOnCheckpoint) {
      const items = trivia;
      const tMiles = currentTrivia?.CUMULATIVE_MILES ?? -Infinity;
      const tIdx = items.findIndex(
        it => (it?.CUMULATIVE_MILES ?? -Infinity) === tMiles,
      );
      const enriched = {
        ...currentTrivia,
        index: tIdx >= 0 ? tIdx : undefined,
      } as PointType;
      return { item: enriched, type: 'trivia' };
    }
    const currentCheckpoint = get().getCurrentCheckpoint();
    if (currentCheckpoint) {
      const cps = checkpoints;
      const cMiles = currentCheckpoint?.CUMULATIVE_MILES ?? -Infinity;
      const cIdx = cps.findIndex(
        it => (it?.CUMULATIVE_MILES ?? -Infinity) === cMiles,
      );
      const enriched = {
        ...currentCheckpoint,
        index: cIdx >= 0 ? cIdx : undefined,
      } as PointType;
      return { item: enriched, type: 'checkpoint' };
    }
    return null;
  },
}));

// ---------------------------------------------------------------------------
// Sync selectors
//
// Thresholds live in src/constants/sync.ts. These helpers operate on a
// SyncStatus value (or read it from the store) so components stay declarative.
// ---------------------------------------------------------------------------

/** True once we believe the sync is long enough to warrant the overlay UI. */
export function selectIsLongSync(status: SyncStatus): boolean {
  if (status.phase !== 'syncing') return false;
  if (status.chunksTotal > LONG_SYNC_CHUNK_THRESHOLD) return true;
  if (
    status.startedAt !== null &&
    Date.now() - status.startedAt > LONG_SYNC_TIME_THRESHOLD_MS
  ) {
    return true;
  }
  return false;
}

/** Rough seconds-remaining estimate based on chunks completed so far. */
export function selectSyncEtaSeconds(status: SyncStatus): number | null {
  if (
    status.phase !== 'syncing' ||
    status.chunksDone === 0 ||
    status.startedAt === null
  ) {
    return null;
  }
  const elapsedMs = Date.now() - status.startedAt;
  const msPerChunk = elapsedMs / status.chunksDone;
  const remainingChunks = Math.max(0, status.chunksTotal - status.chunksDone);
  return Math.round((remainingChunks * msPerChunk) / 1000);
}

/** Fraction (0..1) of chunks completed - useful for a progress bar. */
export function selectSyncDayProgress(status: SyncStatus): number {
  if (status.chunksTotal <= 0) return 0;
  return Math.min(1, status.chunksDone / status.chunksTotal);
}
