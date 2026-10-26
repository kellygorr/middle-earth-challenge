/**
 * Selector tests for `progressStore` — exercises the pure "given the
 * current miles total, what's the current/next/latest checkpoint or
 * trivia point" derivations without touching the database.
 *
 * These are the queries every screen depends on for its UI branching.
 * We drive them by writing state directly with `setState` — the store
 * itself imports the DB module, but jest.setup.js mocks op-sqlite so
 * import doesn't hit disk. No selector under test calls a DB action.
 */

import checkpointsRaw from '../../constants/checkpoints.json';
import triviaRaw from '../../constants/trivia.json';
import type { PointType } from '../../types';
import { TOTAL_JOURNEY_MILES } from '../../constants/gameConstants';
import { milesToSteps } from '../../utils/stride';
import { useProgressStore } from '../progressStore';

const checkpoints = checkpointsRaw as PointType[];
const trivia = triviaRaw as PointType[];

// Reset just the pieces of store state each test touches. Wholesale
// `setState({})` would clear the action functions installed by
// `create()`, so we only reset the value fields.
function setMiles(miles: number) {
  useProgressStore.setState({ miles });
}

function setEntries(
  entries: Array<{ miles: number; steps: number; date?: number }>,
) {
  const miles = entries.reduce((sum, entry) => sum + entry.miles, 0);
  const steps = entries.reduce((sum, entry) => sum + entry.steps, 0);
  useProgressStore.setState({
    miles,
    steps,
    distanceEntries: entries.map((e, i) => ({
      id: `test-${i}`,
      saveId: 'default',
      date: e.date ?? i * 1000,
      miles: e.miles,
      steps: e.steps,
      source: 'manual',
    })),
  });
}

beforeEach(() => {
  useProgressStore.setState({
    miles: 0,
    steps: 0,
    testOverrideMiles: null,
  });
  setEntries([]);
});

describe('Dev Walk override', () => {
  it('changes displayed progress without mutating real totals', () => {
    useProgressStore.setState({ miles: 4, steps: 8400 });
    useProgressStore.getState().setTestMiles(12.5);

    expect(useProgressStore.getState().miles).toBe(4);
    expect(useProgressStore.getState().steps).toBe(8400);
    expect(useProgressStore.getState().getDisplayMiles()).toBe(12.5);
    expect(milesToSteps(useProgressStore.getState().getDisplayMiles())).toBe(
      milesToSteps(12.5),
    );
  });

  it('clears repeated overrides without restoring or rewriting real totals', () => {
    useProgressStore.setState({ miles: 4, steps: 8400 });

    useProgressStore.getState().setTestMiles(10);
    useProgressStore.getState().setTestMiles(20);
    useProgressStore.getState().clearTestOverride();

    expect(useProgressStore.getState().miles).toBe(4);
    expect(useProgressStore.getState().steps).toBe(8400);
    expect(useProgressStore.getState().getDisplayMiles()).toBe(4);
  });

  it('drives checkpoint selectors from the temporary override', () => {
    useProgressStore.setState({ miles: 4, steps: 8400 });

    useProgressStore.getState().setTestMiles(120);

    expect(useProgressStore.getState().isExactlyOnCheckpoint()).toBe(1);
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTotalMiles / getTotalSteps
// ---------------------------------------------------------------------------

describe('getTotalMiles / getTotalSteps', () => {
  it('return 0 when there are no entries', () => {
    expect(useProgressStore.getState().getTotalMiles()).toBe(0);
    expect(useProgressStore.getState().getTotalSteps()).toBe(0);
  });

  it('sum the entries', () => {
    setEntries([
      { miles: 1.5, steps: 3000 },
      { miles: 0.25, steps: 500 },
      { miles: 4, steps: 8000 },
    ]);
    expect(useProgressStore.getState().getTotalMiles()).toBeCloseTo(5.75, 5);
    expect(useProgressStore.getState().getTotalSteps()).toBe(11_500);
  });

  it('uses committed totals when legacy entries have missing fields', () => {
    useProgressStore.setState({
      miles: 2,
      steps: 0,
      distanceEntries: [
        { id: 'a', saveId: 'default', date: 0, miles: 2 } as any,
        { id: 'b', saveId: 'default', date: 1 } as any,
      ],
    });
    expect(useProgressStore.getState().getTotalMiles()).toBe(2);
    expect(useProgressStore.getState().getTotalSteps()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getProgressMiles / getProgressPercentage
// ---------------------------------------------------------------------------

describe('getProgressMiles', () => {
  it('clamps below 0', () => {
    setMiles(-10);
    expect(useProgressStore.getState().getProgressMiles()).toBe(0);
  });

  it('clamps above TOTAL_JOURNEY_MILES', () => {
    setMiles(TOTAL_JOURNEY_MILES + 500);
    expect(useProgressStore.getState().getProgressMiles()).toBe(
      TOTAL_JOURNEY_MILES,
    );
  });

  it('passes valid values through', () => {
    setMiles(500);
    expect(useProgressStore.getState().getProgressMiles()).toBe(500);
  });
});

describe('getProgressPercentage', () => {
  it('is 0 at 0 miles', () => {
    setMiles(0);
    expect(useProgressStore.getState().getProgressPercentage()).toBe(0);
  });

  it('is 100 at TOTAL_JOURNEY_MILES', () => {
    setMiles(TOTAL_JOURNEY_MILES);
    expect(useProgressStore.getState().getProgressPercentage()).toBe(100);
  });

  it('clamps to 100 above TOTAL_JOURNEY_MILES', () => {
    setMiles(TOTAL_JOURNEY_MILES + 500);
    expect(useProgressStore.getState().getProgressPercentage()).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getCheckpointIndexForMiles / getLatestCompletedCheckpointNumber
// ---------------------------------------------------------------------------

describe('getCheckpointIndexForMiles', () => {
  it('returns -1 before the first non-start checkpoint', () => {
    setMiles(1); // < Bree (120 mi)
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(-1);
  });

  it('returns the index of the highest checkpoint reached', () => {
    // Bree = index 1, at 120 miles.
    setMiles(120);
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(1);
    // Just past Bree, still under Rivendell.
    setMiles(200);
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(1);
    // Reached Rivendell (index 2 @ 420 mi).
    setMiles(420);
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(2);
  });

  it('returns the final index at TOTAL_JOURNEY_MILES', () => {
    setMiles(TOTAL_JOURNEY_MILES);
    const last = checkpoints.length - 1;
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(last);
  });

  it('never counts the isStart checkpoint (its CUMULATIVE_MILES is 0)', () => {
    // Even at 0 miles, index should be -1 because the filter excludes
    // m <= 0 to skip the starting checkpoint.
    setMiles(0);
    expect(useProgressStore.getState().getCheckpointIndexForMiles()).toBe(-1);
  });
});

describe('getLatestCompletedCheckpointNumber', () => {
  it('is 0 when no checkpoints have been reached', () => {
    setMiles(1);
    expect(
      useProgressStore.getState().getLatestCompletedCheckpointNumber(),
    ).toBe(0);
  });

  it('is 1-based when a checkpoint has been reached', () => {
    setMiles(120); // Bree, index 1
    expect(
      useProgressStore.getState().getLatestCompletedCheckpointNumber(),
    ).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isExactlyOnCheckpoint
// ---------------------------------------------------------------------------

describe('isExactlyOnCheckpoint', () => {
  it('returns -1 when miles is between checkpoints', () => {
    setMiles(200);
    expect(useProgressStore.getState().isExactlyOnCheckpoint()).toBe(-1);
  });

  it('returns the index when miles matches a checkpoint exactly', () => {
    setMiles(120);
    expect(useProgressStore.getState().isExactlyOnCheckpoint()).toBe(1);
  });

  it('tolerates floating-point noise within epsilon', () => {
    // 120 miles + 1e-9 should still count as "exactly on Bree"
    setMiles(120 + 1e-9);
    expect(useProgressStore.getState().isExactlyOnCheckpoint()).toBe(1);
  });

  it('does NOT match when the noise exceeds epsilon', () => {
    setMiles(120 + 1e-4);
    expect(useProgressStore.getState().isExactlyOnCheckpoint()).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// getRemainingMilesTo
// ---------------------------------------------------------------------------

describe('getRemainingMilesTo', () => {
  it('returns the delta when the target is ahead', () => {
    setMiles(100);
    expect(useProgressStore.getState().getRemainingMilesTo(250)).toBe(150);
  });

  it('returns 0 when the target has been reached or passed', () => {
    setMiles(300);
    expect(useProgressStore.getState().getRemainingMilesTo(250)).toBe(0);
  });

  it('handles null/undefined target defensively', () => {
    setMiles(100);
    expect(useProgressStore.getState().getRemainingMilesTo(null as any)).toBe(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// getNextCheckpointAfterMiles
// ---------------------------------------------------------------------------

describe('getNextCheckpointAfterMiles', () => {
  it('returns the next checkpoint strictly after the given miles', () => {
    const bree = checkpoints[1];
    const next = useProgressStore.getState().getNextCheckpointAfterMiles(0);
    expect(next?.name).toBe(bree.name);
  });

  it('skips the current checkpoint when exactly on it', () => {
    const bree = checkpoints[1]; // 120
    const rivendell = checkpoints[2]; // 420
    const next = useProgressStore
      .getState()
      .getNextCheckpointAfterMiles(bree.CUMULATIVE_MILES);
    expect(next?.name).toBe(rivendell.name);
  });

  it('returns null when there is no checkpoint further ahead', () => {
    const next = useProgressStore
      .getState()
      .getNextCheckpointAfterMiles(TOTAL_JOURNEY_MILES + 100);
    expect(next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPreviousTrivia
// ---------------------------------------------------------------------------

describe('getPreviousTrivia', () => {
  it('returns trivia points between checkpoint[i-1] and checkpoint[i]', () => {
    // Bree (index 1, 120mi) — trivia "The Old Forest" at 77mi is
    // between Hobbiton (0) and Bree (120).
    const prev = useProgressStore.getState().getPreviousTrivia(1);
    expect(prev.map(t => t.name)).toContain('The Old Forest');
  });

  it('returns [] for out-of-range indices', () => {
    expect(useProgressStore.getState().getPreviousTrivia(0)).toEqual([]);
    expect(
      useProgressStore.getState().getPreviousTrivia(checkpoints.length),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCurrentCheckpoint / getCurrentTrivia
// ---------------------------------------------------------------------------

describe('getCurrentCheckpoint', () => {
  it('returns the starting checkpoint at 0 miles', () => {
    setMiles(0);
    const cp = useProgressStore.getState().getCurrentCheckpoint();
    expect(cp?.isStart).toBe(true);
  });

  it('returns null when between checkpoints', () => {
    setMiles(200);
    expect(useProgressStore.getState().getCurrentCheckpoint()).toBeNull();
  });

  it('returns the checkpoint when miles matches exactly', () => {
    setMiles(120);
    expect(useProgressStore.getState().getCurrentCheckpoint()?.name).toBe(
      'Bree',
    );
  });
});

describe('getCurrentTrivia', () => {
  it('returns null when not on a trivia mile', () => {
    setMiles(100);
    expect(useProgressStore.getState().getCurrentTrivia()).toBeNull();
  });

  it('returns the trivia point when miles matches exactly', () => {
    // Trivia "Weathertop" is at 200 miles per trivia.json.
    setMiles(200);
    expect(useProgressStore.getState().getCurrentTrivia()?.name).toBe(
      'Weathertop',
    );
  });
});

// ---------------------------------------------------------------------------
// getActiveInfoItem
// ---------------------------------------------------------------------------

describe('getActiveInfoItem', () => {
  it('returns null when between checkpoints and trivia', () => {
    setMiles(100);
    expect(useProgressStore.getState().getActiveInfoItem()).toBeNull();
  });

  it('returns a trivia item when exactly on a trivia mile', () => {
    setMiles(200);
    const item = useProgressStore.getState().getActiveInfoItem();
    expect(item?.type).toBe('trivia');
    expect(item?.item.name).toBe('Weathertop');
  });

  it('returns a checkpoint item when exactly on a checkpoint', () => {
    setMiles(120);
    const item = useProgressStore.getState().getActiveInfoItem();
    expect(item?.type).toBe('checkpoint');
    expect(item?.item.name).toBe('Bree');
  });
});

// ---------------------------------------------------------------------------
// isLockedCheckpoint / isLatestCheckpoint
// ---------------------------------------------------------------------------

describe('isLockedCheckpoint', () => {
  it('is true when target miles is ahead of progress', () => {
    setMiles(100);
    expect(useProgressStore.getState().isLockedCheckpoint(200)).toBe(true);
  });

  it('is false when target miles is behind progress', () => {
    setMiles(300);
    expect(useProgressStore.getState().isLockedCheckpoint(200)).toBe(false);
  });

  it('is false when target miles is exactly equal', () => {
    setMiles(200);
    expect(useProgressStore.getState().isLockedCheckpoint(200)).toBe(false);
  });
});

describe('isNextLockedCheckpoint', () => {
  it('is true for the closest checkpoint still ahead of progress', () => {
    setMiles(100);
    // Real checkpoints.json is [0, 120, 420, 595, 895, 1055, 1165, 1235];
    // 120 is the first one still ahead of 100 miles.
    expect(useProgressStore.getState().isNextLockedCheckpoint(120)).toBe(
      true,
    );
  });

  it('is false for a locked checkpoint that is not the immediate next one', () => {
    setMiles(100);
    expect(useProgressStore.getState().isNextLockedCheckpoint(420)).toBe(
      false,
    );
  });

  it('is false for an already-reached checkpoint', () => {
    setMiles(300);
    expect(useProgressStore.getState().isNextLockedCheckpoint(120)).toBe(
      false,
    );
  });

  it('updates to the new closest checkpoint once the previous one is reached', () => {
    setMiles(120);
    expect(useProgressStore.getState().isNextLockedCheckpoint(420)).toBe(
      true,
    );
    expect(useProgressStore.getState().isNextLockedCheckpoint(120)).toBe(
      false,
    );
  });

  it('is false for every checkpoint once the journey is complete', () => {
    setMiles(1235);
    for (const cp of checkpoints) {
      expect(
        useProgressStore
          .getState()
          .isNextLockedCheckpoint(cp.CUMULATIVE_MILES ?? 0),
      ).toBe(false);
    }
  });
});

describe('isLatestCheckpoint', () => {
  it('is false for the isStart checkpoint (index 0) even when at 0 miles', () => {
    setMiles(0);
    expect(useProgressStore.getState().isLatestCheckpoint(0)).toBe(false);
  });

  it('is true for the highest-index checkpoint currently reached', () => {
    setMiles(120); // Bree, index 1, latest number = 2
    expect(useProgressStore.getState().isLatestCheckpoint(1)).toBe(true);
  });

  it('is false for a lower-index checkpoint even if it is completed', () => {
    setMiles(420); // Rivendell (index 2) is the latest
    expect(useProgressStore.getState().isLatestCheckpoint(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPointFromIndex
// ---------------------------------------------------------------------------

describe('getPointFromIndex', () => {
  it('returns the checkpoint at the requested index by default', () => {
    const cp = useProgressStore.getState().getPointFromIndex(1);
    expect(cp?.name).toBe(checkpoints[1].name);
    expect(cp?.index).toBe(1);
  });

  it('returns a trivia point when type=trivia', () => {
    const t = useProgressStore.getState().getPointFromIndex(0, 'trivia');
    expect(t?.name).toBe(trivia[0].name);
  });

  it('returns null for out-of-range indices', () => {
    expect(useProgressStore.getState().getPointFromIndex(-1)).toBeNull();
    expect(useProgressStore.getState().getPointFromIndex(9999)).toBeNull();
    expect(
      useProgressStore.getState().getPointFromIndex(NaN as unknown as number),
    ).toBeNull();
  });
});
