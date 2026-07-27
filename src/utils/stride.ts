/**
 * Stride conversion helpers — the single source of truth for turning
 * step counts into distance and back.
 *
 * The whole game is scored in "walking equivalent" — every DistanceEntry
 * carries both `miles` and `steps`, and they always satisfy
 * `miles = stepsToMiles(steps)`. When only one signal is measured
 * (manual entry, HC Distance record without a matching Steps record,
 * pedometer-only, etc.) the other is derived here so downstream
 * `SUM(miles)` / `SUM(steps)` queries are trivial.
 *
 * The constants below are baked in at write time. Changing them later
 * will only affect newly written rows — historical rows keep the
 * conversion in effect when they were persisted.
 */

/** Average adult stride length in meters (~2.5 ft). */
export const AVERAGE_STRIDE_METERS = 0.762;

/** Meters → miles conversion factor. */
export const METERS_TO_MILES = 0.000621371;

/** Steps → miles. */
export function stepsToMiles(steps: number): number {
  return steps * AVERAGE_STRIDE_METERS * METERS_TO_MILES;
}

/** Miles → steps (rounded to nearest whole step). */
export function milesToSteps(miles: number): number {
  return Math.round(miles / (AVERAGE_STRIDE_METERS * METERS_TO_MILES));
}

/** Meters → miles. */
export function metersToMiles(meters: number): number {
  return meters * METERS_TO_MILES;
}

/** Miles → meters. */
export function milesToMeters(miles: number): number {
  return miles / METERS_TO_MILES;
}

/**
 * Format a step count for display. Small counts stay legible with
 * thousands separators; large counts collapse into compact K/M form so
 * "1,647,832" doesn't read as an intimidating wall of digits.
 *
 *   999          → "999"
 *   9,999        → "9,999"
 *   84,231       → "84K"
 *   999,999      → "999K"
 *   1,647,832    → "1.6M"
 *   12,345,678   → "12M"
 */
export function formatSteps(steps: number): string {
  const n = Math.max(0, Math.round(steps));
  if (n < 10_000) return n.toLocaleString();
  if (n < 1_000_000) return `${Math.round(n / 1_000)}K`;
  if (n < 10_000_000) {
    // 1.0M–9.9M: one decimal, trim trailing .0
    const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${v}M`;
  }
  return `${Math.round(n / 1_000_000)}M`;
}
