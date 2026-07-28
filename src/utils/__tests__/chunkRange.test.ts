/**
 * Pure-function unit tests for `buildChunks` — the range splitter used
 * by the health-app sync path to break a backfill window into fixed-
 * width slices.
 *
 * These invariants (contiguity, non-overlap, exact boundaries) are the
 * whole reason chunking exists — a bug here would cause missing days
 * on the map or duplicated distance rows.
 */

import { buildChunks } from '../chunkRange';

const DAY = 24 * 60 * 60 * 1000;

function iso(dateStr: string): Date {
  return new Date(dateStr);
}

describe('buildChunks', () => {
  it('returns an empty list when the range is empty', () => {
    const t = iso('2026-01-01T00:00:00Z');
    expect(buildChunks(t, t, 3)).toEqual([]);
  });

  it('returns an empty list when `to` is before `from`', () => {
    const from = iso('2026-01-05T00:00:00Z');
    const to = iso('2026-01-01T00:00:00Z');
    expect(buildChunks(from, to, 3)).toEqual([]);
  });

  it('returns a single chunk when the range is smaller than chunk width', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = iso('2026-01-02T00:00:00Z'); // 1 day
    const chunks = buildChunks(from, to, 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].start.getTime()).toBe(from.getTime());
    expect(chunks[0].end.getTime()).toBe(to.getTime());
  });

  it('splits a 9-day range into three 3-day chunks when chunkDays=3', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 9 * DAY);
    const chunks = buildChunks(from, to, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].end.getTime() - chunks[0].start.getTime()).toBe(3 * DAY);
    expect(chunks[1].end.getTime() - chunks[1].start.getTime()).toBe(3 * DAY);
    expect(chunks[2].end.getTime() - chunks[2].start.getTime()).toBe(3 * DAY);
  });

  it('makes the final chunk shorter when the range does not divide evenly', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 7 * DAY); // 7 days, chunk=3
    const chunks = buildChunks(from, to, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].end.getTime() - chunks[0].start.getTime()).toBe(3 * DAY);
    expect(chunks[1].end.getTime() - chunks[1].start.getTime()).toBe(3 * DAY);
    expect(chunks[2].end.getTime() - chunks[2].start.getTime()).toBe(1 * DAY);
  });

  it('produces chunks that are contiguous and non-overlapping', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 30 * DAY);
    const chunks = buildChunks(from, to, 3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start.getTime()).toBe(chunks[i - 1].end.getTime());
    }
  });

  it('starts exactly at `from` and ends exactly at `to`', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 10 * DAY);
    const chunks = buildChunks(from, to, 3);
    expect(chunks[0].start.getTime()).toBe(from.getTime());
    expect(chunks[chunks.length - 1].end.getTime()).toBe(to.getTime());
  });

  it('handles a very large backfill window without infinite-looping', () => {
    const from = iso('2020-01-01T00:00:00Z');
    const to = iso('2026-01-01T00:00:00Z'); // ~6 years
    const chunks = buildChunks(from, to, 3);
    // ~730 chunks — should complete in ms and cover the range.
    expect(chunks.length).toBeGreaterThan(700);
    expect(chunks.length).toBeLessThan(800);
    expect(chunks[0].start.getTime()).toBe(from.getTime());
    expect(chunks[chunks.length - 1].end.getTime()).toBe(to.getTime());
  });

  it('accepts chunkDays of 1 for finer-grained syncing', () => {
    const from = iso('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 4 * DAY);
    const chunks = buildChunks(from, to, 1);
    expect(chunks).toHaveLength(4);
    for (const c of chunks) {
      expect(c.end.getTime() - c.start.getTime()).toBe(DAY);
    }
  });
});
