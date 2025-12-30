import checkpointsData from '../constants/checkpoints.json';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';

export type Breakpoint = {
  book: number;
  visual: number;
  postOffsetMiles: number;
};

// Build breakpoints from checkpoints.json
// book: cumulativeMiles (book miles), visual: checkpointActivationMiles (fallback to book)
export const getDefaultBreakpoints = (): Breakpoint[] => {
  return (checkpointsData as Array<any>)
    .map(cp => ({
      book: Number(cp.CUMULATIVE_MILES ?? 0),
      visual: Number(cp.checkpointActivationMiles ?? cp.CUMULATIVE_MILES ?? 0),
      postOffsetMiles: Number(cp.postCheckpointOffsetMiles ?? 3),
    }))
    .sort((a, b) => a.book - b.book);
};

// Compute path trim fraction t in [0,1] from book miles using piecewise interpolation
export const computePathProgress = (
  bookMiles: number,
  breakpoints: Breakpoint[],
  totalMiles: number = TOTAL_JOURNEY_MILES,
): number => {
  if (!breakpoints.length) return 0;
  const total = totalMiles;
  const clamped = Math.max(0, Math.min(bookMiles, total));

  // If beyond last breakpoint, clamp to last visual
  const last = breakpoints[breakpoints.length - 1];
  if (clamped >= last.book) {
    return Math.min(last.visual / total, 1);
  }

  // Find segment [i, i+1]
  let i = 0;
  for (; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    if (clamped >= a.book && clamped <= b.book) break;
  }

  const a = breakpoints[i];
  const b = breakpoints[Math.min(i + 1, breakpoints.length - 1)];
  const spanBook = Math.max(1, b.book - a.book);
  const alpha = (clamped - a.book) / spanBook; // 0..1
  // Apply checkpoint-specific visual offset immediately after reaching a checkpoint (except start)
  const visualStart = a.visual + (clamped > a.book ? a.postOffsetMiles : 0);
  const visualEnd = b.visual;
  const visual = visualStart + (visualEnd - visualStart) * alpha;
  return Math.max(0, Math.min(visual / total, 1));
};

// Default mapping used by the app
export const mapBookMilesToPathProgress = (bookMiles: number): number => {
  const bps = getDefaultBreakpoints();
  return computePathProgress(bookMiles, bps, TOTAL_JOURNEY_MILES);
};
