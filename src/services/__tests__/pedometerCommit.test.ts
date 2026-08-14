/**
 * Unit tests for `commitPedometerRange` — the single-source-of-truth
 * commit path shared by every pedometer trigger (2-min tick, AppState
 * catch-up, WorkManager sweep, mode-switch flush, Sync-Now button).
 *
 * We mock the native pedometer service, the progress store, and the
 * milestone notifier so these tests exercise only the commit logic —
 * step read, entry construction, store roll-up, snapshot persistence,
 * and the "never derail the caller" guarantees.
 */

// jest.mock factories may only reference variables whose names start
// with `mock` — a lint safety net against uninitialised references at
// hoist time. All shared state below is prefixed accordingly.

interface StoreState {
  miles: number;
  steps: number;
  distanceEntries: Array<{
    id: string;
    miles: number;
    steps: number;
  }>;
  addDistanceEntries: jest.Mock;
  setMiles: jest.Mock;
  setSteps: jest.Mock;
  persistMilesSnapshot: jest.Mock;
  getTotalMiles: () => number;
  getTotalSteps: () => number;
}

const mockGetStepsBetween = jest.fn();
const mockCheckAndFireMilestones = jest.fn();
const mockStoreState: { ref: StoreState } = { ref: null as any };

jest.mock('../pedometerService', () => ({
  pedometerService: {
    getStepsBetween: (fromMs: number, toMs: number) =>
      mockGetStepsBetween(fromMs, toMs),
  },
}));

jest.mock('../milestoneNotifier', () => ({
  checkAndFireMilestones: (before: number, after: number) =>
    mockCheckAndFireMilestones(before, after),
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: {
    getState: () => mockStoreState.ref,
  },
}));

import { commitPedometerRange } from '../pedometerCommit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore(initial: Partial<StoreState> = {}) {
  const entries: StoreState['distanceEntries'] = initial.distanceEntries ?? [];
  const state: StoreState = {
    miles: initial.miles ?? 0,
    steps: initial.steps ?? 0,
    distanceEntries: entries,
    addDistanceEntries: jest.fn(async (newEntries: any[]) => {
      state.distanceEntries = [...state.distanceEntries, ...newEntries];
    }),
    setMiles: jest.fn((m: number) => {
      state.miles = m;
    }),
    setSteps: jest.fn((s: number) => {
      state.steps = s;
    }),
    persistMilesSnapshot: jest.fn(async () => {}),
    getTotalMiles: () =>
      state.distanceEntries.reduce((sum, e) => sum + (e.miles ?? 0), 0),
    getTotalSteps: () =>
      state.distanceEntries.reduce((sum, e) => sum + (e.steps ?? 0), 0),
  };
  mockStoreState.ref = state;
  return state;
}

beforeEach(() => {
  mockGetStepsBetween.mockReset();
  mockCheckAndFireMilestones.mockReset();
  mockCheckAndFireMilestones.mockResolvedValue(undefined);
  resetStore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitPedometerRange', () => {
  it('returns a no-op result when the window is inverted', async () => {
    const result = await commitPedometerRange(1000, 1000);
    expect(result).toEqual({ steps: 0, miles: 0, entryWritten: false });
    expect(mockGetStepsBetween).not.toHaveBeenCalled();
    expect(mockStoreState.ref.addDistanceEntries).not.toHaveBeenCalled();
  });

  it('returns a no-op result when the native read reports zero steps', async () => {
    mockGetStepsBetween.mockResolvedValueOnce({
      steps: 0,
      fromMs: 0,
      toMs: 1000,
    });

    const result = await commitPedometerRange(0, 1000);

    expect(result).toEqual({ steps: 0, miles: 0, entryWritten: false });
    expect(mockStoreState.ref.addDistanceEntries).not.toHaveBeenCalled();
    expect(mockStoreState.ref.persistMilesSnapshot).not.toHaveBeenCalled();
    expect(mockCheckAndFireMilestones).not.toHaveBeenCalled();
  });

  it('writes an entry, updates the store, persists the snapshot, and fires the milestone check on the happy path', async () => {
    mockGetStepsBetween.mockResolvedValueOnce({
      steps: 2000,
      fromMs: 0,
      toMs: 60_000,
    });

    const result = await commitPedometerRange(0, 60_000);

    expect(result.entryWritten).toBe(true);
    expect(result.steps).toBe(2000);
    expect(result.miles).toBeGreaterThan(0);

    // Entry inserted with the expected shape.
    expect(mockStoreState.ref.addDistanceEntries).toHaveBeenCalledTimes(1);
    const inserted = (
      mockStoreState.ref.addDistanceEntries.mock.calls[0][0] as any[]
    )[0];
    expect(inserted.id).toBe('pedo_0');
    expect(inserted.source).toBe('pedometer');
    expect(inserted.saveId).toBe('default');
    expect(inserted.steps).toBe(2000);
    expect(inserted.miles).toBe(result.miles);
    expect(inserted.miles).toBeGreaterThan(0);
    // Date is the window midpoint.
    expect(inserted.date).toBe(30_000);

    // Store roll-up used the selectors, not a manual reduce.
    expect(mockStoreState.ref.setMiles).toHaveBeenCalledWith(result.miles);
    expect(mockStoreState.ref.setSteps).toHaveBeenCalledWith(2000);
    expect(mockStoreState.ref.persistMilesSnapshot).toHaveBeenCalledTimes(1);

    // Milestone check receives miles-before / miles-after.
    expect(mockCheckAndFireMilestones).toHaveBeenCalledWith(0, result.miles);
  });

  it('produces a stable, watermark-safe id derived from the window start', async () => {
    mockGetStepsBetween.mockResolvedValue({
      steps: 500,
      fromMs: 12345,
      toMs: 12500,
    });

    await commitPedometerRange(12345, 12500);
    const first = (
      mockStoreState.ref.addDistanceEntries.mock.calls[0][0] as any[]
    )[0].id;

    resetStore();
    await commitPedometerRange(12345, 12500);
    const second = (
      mockStoreState.ref.addDistanceEntries.mock.calls[0][0] as any[]
    )[0].id;

    expect(first).toBe(second);
    expect(first).toBe('pedo_12345');
  });

  it('splits a range crossing local midnight into daily entries', async () => {
    const fromMs = new Date(2026, 6, 30, 23, 59).getTime();
    const midnight = new Date(2026, 6, 31, 0, 0).getTime();
    const toMs = new Date(2026, 6, 31, 0, 1).getTime();
    mockGetStepsBetween
      .mockResolvedValueOnce({ steps: 400, fromMs, toMs: midnight })
      .mockResolvedValueOnce({ steps: 600, fromMs: midnight, toMs });

    const result = await commitPedometerRange(fromMs, toMs);

    expect(mockGetStepsBetween).toHaveBeenNthCalledWith(1, fromMs, midnight);
    expect(mockGetStepsBetween).toHaveBeenNthCalledWith(2, midnight, toMs);
    const inserted = mockStoreState.ref.addDistanceEntries.mock.calls[0][0];
    expect(inserted).toHaveLength(2);
    expect(inserted.map((entry: any) => entry.id)).toEqual([
      `pedo_${fromMs}`,
      `pedo_${midnight}`,
    ]);
    expect(result.steps).toBe(1000);
  });

  it('rethrows read failures so the caller can surface a sync error', async () => {
    const boom = new Error('native read failed');
    mockGetStepsBetween.mockRejectedValueOnce(boom);

    await expect(commitPedometerRange(0, 1000)).rejects.toThrow(
      'native read failed',
    );
    expect(mockStoreState.ref.addDistanceEntries).not.toHaveBeenCalled();
  });

  it('does not derail the commit when the milestone notifier throws', async () => {
    mockGetStepsBetween.mockResolvedValueOnce({
      steps: 1000,
      fromMs: 0,
      toMs: 1000,
    });
    mockCheckAndFireMilestones.mockRejectedValueOnce(
      new Error('notifier down'),
    );

    // Should resolve, not reject — commit path swallows notifier errors by design.
    const result = await commitPedometerRange(0, 1000);
    expect(result.entryWritten).toBe(true);
    expect(mockStoreState.ref.persistMilesSnapshot).toHaveBeenCalledTimes(1);
  });

  it('feeds `milesBefore` from the pre-commit store state, not the post-commit total', async () => {
    resetStore({
      miles: 5,
      distanceEntries: [{ id: 'earlier', miles: 5, steps: 6560 }],
    });
    mockGetStepsBetween.mockResolvedValueOnce({
      steps: 1000,
      fromMs: 100,
      toMs: 200,
    });

    await commitPedometerRange(100, 200);

    expect(mockCheckAndFireMilestones).toHaveBeenCalledTimes(1);
    const [before, after] = mockCheckAndFireMilestones.mock.calls[0];
    expect(before).toBe(5); // pre-commit miles
    expect(after).toBeGreaterThan(5); // post-commit miles (5 + new entry)
    expect(after).toBeCloseTo(mockStoreState.ref.miles);
  });

  it('floors and clamps negative native step counts to zero', async () => {
    mockGetStepsBetween.mockResolvedValueOnce({
      steps: -50,
      fromMs: 0,
      toMs: 1000,
    });

    const result = await commitPedometerRange(0, 1000);

    expect(result).toEqual({ steps: 0, miles: 0, entryWritten: false });
    expect(mockStoreState.ref.addDistanceEntries).not.toHaveBeenCalled();
  });
});
