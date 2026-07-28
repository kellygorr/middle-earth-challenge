/**
 * Pure-function unit tests for the stride conversion helpers.
 *
 * Loads nothing from React Native, the DB, or native modules — so this
 * file runs in <100ms and never needs a mock harness. Any bug that
 * corrupts the miles ↔ steps conversion silently corrupts every
 * distance row in the app, so this file exists as the first line of
 * defence.
 */

import {
  AVERAGE_STRIDE_METERS,
  METERS_TO_MILES,
  stepsToMiles,
  milesToSteps,
  metersToMiles,
  milesToMeters,
  formatSteps,
} from '../stride';

describe('stride constants', () => {
  it('exports the canonical stride length used by the DB migration', () => {
    // Sanity check — if these ever change, the ALTER TABLE backfill in
    // database.ts must be re-run for every existing install.
    expect(AVERAGE_STRIDE_METERS).toBeCloseTo(0.762, 5);
    expect(METERS_TO_MILES).toBeCloseTo(0.000621371, 8);
  });
});

describe('stepsToMiles', () => {
  it('returns 0 for 0 steps', () => {
    expect(stepsToMiles(0)).toBe(0);
  });

  it('produces a positive miles value for a positive step count', () => {
    expect(stepsToMiles(2000)).toBeGreaterThan(0);
  });

  it('is roughly ~1 mile per 2100 steps at the default stride', () => {
    // 2100 * 0.762m * 0.000621371 mi/m ≈ 0.994 mi
    expect(stepsToMiles(2100)).toBeCloseTo(0.994, 2);
  });

  it('is linear', () => {
    const one = stepsToMiles(1000);
    const two = stepsToMiles(2000);
    expect(two).toBeCloseTo(one * 2, 10);
  });

  it('propagates non-finite inputs as-is (caller is responsible for guarding)', () => {
    // Documenting current behaviour so a future guard doesn't silently
    // change downstream math. If NaN appears in a distance row that's a
    // bug at the callsite, not here.
    expect(Number.isNaN(stepsToMiles(NaN))).toBe(true);
  });
});

describe('milesToSteps', () => {
  it('returns 0 for 0 miles', () => {
    expect(milesToSteps(0)).toBe(0);
  });

  it('rounds to the nearest whole step', () => {
    // Round-trip: stepsToMiles(1234) then back should land near 1234.
    const miles = stepsToMiles(1234);
    expect(milesToSteps(miles)).toBe(1234);
    // Fractional miles round.
    expect(milesToSteps(0.0001)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(milesToSteps(0.5))).toBe(true);
  });

  it('is the inverse of stepsToMiles across a range of step counts', () => {
    for (const n of [1, 100, 999, 1000, 12345, 999_999]) {
      expect(milesToSteps(stepsToMiles(n))).toBe(n);
    }
  });
});

describe('metersToMiles / milesToMeters', () => {
  it('round-trips within floating-point tolerance', () => {
    for (const m of [0, 1, 100, 12345.6789]) {
      expect(milesToMeters(metersToMiles(m))).toBeCloseTo(m, 6);
    }
  });

  it('1609.34 m ≈ 1 mile', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 4);
  });
});

describe('formatSteps', () => {
  it('formats counts under 10k with thousands separators', () => {
    expect(formatSteps(0)).toBe('0');
    expect(formatSteps(999)).toBe('999');
    expect(formatSteps(9_999)).toBe('9,999');
  });

  it('collapses tens-of-thousands to K', () => {
    expect(formatSteps(10_000)).toBe('10K');
    expect(formatSteps(84_231)).toBe('84K');
    // Rounds up to 1000K just before the M boundary — Math.round on the
    // K value, no thousands separator inside the K prefix.
    expect(formatSteps(999_999)).toBe('1000K');
  });

  it('collapses hundreds-of-thousands to K then M at the boundary', () => {
    expect(formatSteps(1_000_000)).toBe('1M');
    expect(formatSteps(1_647_832)).toBe('1.6M');
    expect(formatSteps(9_999_999)).toBe('10M');
  });

  it('collapses ten-plus-million to M without decimals', () => {
    expect(formatSteps(12_345_678)).toBe('12M');
    expect(formatSteps(999_999_999)).toBe('1000M');
  });

  it('clamps negative input to 0', () => {
    expect(formatSteps(-100)).toBe('0');
  });

  it('rounds fractional input', () => {
    expect(formatSteps(0.4)).toBe('0');
    expect(formatSteps(0.6)).toBe('1');
  });
});
