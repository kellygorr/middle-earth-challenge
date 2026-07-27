/**
 * Data integrity tests for the hand-authored journey data
 * (`checkpoints.json` + `trivia.json`).
 *
 * These are the cheapest and highest-ROI tests in the project: a bad
 * comma in a JSON file or a mistyped mile value can silently break the
 * map, the checkpoint modal, and the milestone notifier. Because the
 * data is pure JSON (no imports, no side effects), the tests run in a
 * few ms and never need mocks.
 */

import checkpointsRaw from '../checkpoints.json';
import triviaRaw from '../trivia.json';
import { TOTAL_JOURNEY_MILES } from '../gameConstants';
import type { PointType } from '../../types';

const checkpoints = checkpointsRaw as PointType[];
const trivia = triviaRaw as PointType[];

describe('checkpoints.json', () => {
  it('contains at least one checkpoint', () => {
    expect(checkpoints.length).toBeGreaterThan(0);
  });

  it('every checkpoint has a name and finite non-negative CUMULATIVE_MILES', () => {
    for (const cp of checkpoints) {
      expect(typeof cp.name).toBe('string');
      expect(cp.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(cp.CUMULATIVE_MILES)).toBe(true);
      expect(cp.CUMULATIVE_MILES).toBeGreaterThanOrEqual(0);
    }
  });

  it('is strictly increasing by CUMULATIVE_MILES', () => {
    for (let i = 1; i < checkpoints.length; i++) {
      expect(checkpoints[i].CUMULATIVE_MILES).toBeGreaterThan(
        checkpoints[i - 1].CUMULATIVE_MILES,
      );
    }
  });

  it('has exactly one isStart checkpoint', () => {
    const starts = checkpoints.filter(c => c.isStart);
    expect(starts).toHaveLength(1);
    expect(starts[0].CUMULATIVE_MILES).toBe(0);
  });

  it('has exactly one isEnd checkpoint', () => {
    const ends = checkpoints.filter(c => c.isEnd);
    expect(ends).toHaveLength(1);
  });

  it('the isEnd checkpoint is at TOTAL_JOURNEY_MILES', () => {
    const end = checkpoints.find(c => c.isEnd)!;
    expect(end.CUMULATIVE_MILES).toBe(TOTAL_JOURNEY_MILES);
  });

  it('every checkpoint has valid map coordinates', () => {
    for (const cp of checkpoints) {
      expect(Number.isFinite(cp.x)).toBe(true);
      expect(Number.isFinite(cp.y)).toBe(true);
      expect(cp.x).toBeGreaterThan(0);
      expect(cp.y).toBeGreaterThan(0);
    }
  });

  it('every checkpoint has a description with non-empty text', () => {
    for (const cp of checkpoints) {
      expect(cp.description).toBeDefined();
      expect(typeof cp.description!.text).toBe('string');
      expect(cp.description!.text.length).toBeGreaterThan(0);
    }
  });

  it('every checkpoint has a description.image filename', () => {
    for (const cp of checkpoints) {
      expect(typeof cp.description?.image).toBe('string');
      expect(cp.description!.image!.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate names', () => {
    const names = checkpoints.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has no two checkpoints at identical coordinates', () => {
    const coords = new Set(checkpoints.map(c => `${c.x},${c.y}`));
    expect(coords.size).toBe(checkpoints.length);
  });
});

describe('trivia.json', () => {
  it('contains at least one trivia point', () => {
    expect(trivia.length).toBeGreaterThan(0);
  });

  it('every trivia point has a name and finite positive CUMULATIVE_MILES', () => {
    for (const t of trivia) {
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(t.CUMULATIVE_MILES)).toBe(true);
      expect(t.CUMULATIVE_MILES).toBeGreaterThan(0);
    }
  });

  it('is sorted ascending by CUMULATIVE_MILES', () => {
    for (let i = 1; i < trivia.length; i++) {
      // `getPreviousTrivia` in progressStore assumes ascending order
      // and short-circuits on the first out-of-range value.
      expect(trivia[i].CUMULATIVE_MILES).toBeGreaterThanOrEqual(
        trivia[i - 1].CUMULATIVE_MILES,
      );
    }
  });

  it('every trivia point has a description with text', () => {
    for (const t of trivia) {
      expect(typeof t.description?.text).toBe('string');
      expect(t.description!.text.length).toBeGreaterThan(0);
    }
  });

  it('every trivia point falls between the isStart and isEnd checkpoints (no orphans)', () => {
    const startMiles = checkpoints.find(c => c.isStart)!.CUMULATIVE_MILES;
    const endMiles = checkpoints.find(c => c.isEnd)!.CUMULATIVE_MILES;
    for (const t of trivia) {
      expect(t.CUMULATIVE_MILES).toBeGreaterThan(startMiles);
      expect(t.CUMULATIVE_MILES).toBeLessThan(endMiles);
    }
  });

  it('has no duplicate names', () => {
    const names = trivia.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has no trivia point sitting exactly on a checkpoint', () => {
    // A trivia point at exactly the same mile as a checkpoint would
    // cause the checkpoint modal + trivia modal to fight for focus.
    const cpMiles = new Set(checkpoints.map(c => c.CUMULATIVE_MILES));
    for (const t of trivia) {
      expect(cpMiles.has(t.CUMULATIVE_MILES)).toBe(false);
    }
  });
});

describe('journey data consistency', () => {
  it('every checkpoint description reads coherently as a single paragraph or two', () => {
    // Sanity check — the notification body slicer in milestoneNotifier
    // takes the first line up to 140 chars. If any description starts
    // with only whitespace, the notification body will be empty.
    for (const cp of checkpoints) {
      const first = cp.description!.text.split(/\r?\n/, 1)[0].trim();
      expect(first.length).toBeGreaterThan(0);
    }
  });

  it('has no cumulative mile value exceeding TOTAL_JOURNEY_MILES', () => {
    for (const cp of checkpoints) {
      expect(cp.CUMULATIVE_MILES).toBeLessThanOrEqual(TOTAL_JOURNEY_MILES);
    }
    for (const t of trivia) {
      expect(t.CUMULATIVE_MILES).toBeLessThanOrEqual(TOTAL_JOURNEY_MILES);
    }
  });
});
