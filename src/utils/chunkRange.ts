/**
 * Split a `[from, to]` time range into consecutive fixed-width chunks,
 * oldest first. Used by the health-app sync path to bound each Health
 * Connect / HealthKit read so a long backfill can be interrupted,
 * retried, and re-entered without re-fetching data we already have.
 *
 * Pure function — no side effects, no platform imports — so it can be
 * unit-tested without a React Native environment.
 *
 *   buildChunks(dayA, dayA + 7d, 3) → [ [A, A+3d), [A+3d, A+6d), [A+6d, A+7d) ]
 *
 * Guarantees:
 *   - Returns `[]` when `to <= from` (never negative or zero-width chunks).
 *   - Chunks are non-overlapping and contiguous.
 *   - The last chunk's `end` is exactly `to`.
 *   - The first chunk's `start` is exactly `from`.
 *   - Widths are `chunkDays * 86_400_000 ms` except for the final chunk,
 *     which may be shorter if the range doesn't divide evenly.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Chunk {
  start: Date;
  end: Date;
}

export function buildChunks(from: Date, to: Date, chunkDays: number): Chunk[] {
  if (to.getTime() <= from.getTime()) return [];
  const chunks: Chunk[] = [];
  let cursor = from.getTime();
  const end = to.getTime();
  const width = chunkDays * MS_PER_DAY;
  while (cursor < end) {
    const next = Math.min(cursor + width, end);
    chunks.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }
  return chunks;
}

export function buildAlignedChunks(
  from: Date,
  to: Date,
  chunkDays: number,
): Chunk[] {
  if (to.getTime() <= from.getTime()) return [];

  const chunks: Chunk[] = [];
  const end = to.getTime();
  const width = chunkDays * MS_PER_DAY;
  let cursor = from.getTime();

  while (cursor < end) {
    const nextBoundary = (Math.floor(cursor / width) + 1) * width;
    const next = Math.min(nextBoundary, end);
    chunks.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }

  return chunks;
}
