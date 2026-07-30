import {
  getDualModeInitialCursor,
  getTrackingModeForSources,
  resolveDualPermissionOutcome,
} from '../trackingModeService';
import { startOfLocalDay } from '../dualSourceReconciliation';

describe('dual tracking mode transition cursor', () => {
  const noon = new Date(2026, 6, 30, 12).getTime();

  it('reconciles the transition day when Health Connect was active', () => {
    expect(getDualModeInitialCursor('health-app', noon)).toBe(
      startOfLocalDay(noon),
    );
  });

  it('reconciles the current day later when pedometer was already active', () => {
    expect(getDualModeInitialCursor('pedometer', noon)).toBe(
      startOfLocalDay(noon),
    );
  });
});

describe('dual permission fallback', () => {
  it.each([
    [true, 'granted', 'dual'],
    [false, 'granted', 'health-app'],
    [true, 'revoked', 'pedometer'],
    [false, 'revoked', 'none'],
    [true, 'unknown', 'unknown'],
    [false, 'unknown', 'unknown'],
  ] as const)(
    'resolves pedometer=%s health=%s to %s',
    (pedometerAvailable, healthPermission, expected) => {
      expect(
        resolveDualPermissionOutcome(pedometerAvailable, healthPermission),
      ).toBe(expected);
    },
  );
});

describe('source toggle combinations', () => {
  it.each([
    [false, false, null],
    [true, false, 'pedometer'],
    [false, true, 'health-app'],
    [true, true, 'dual'],
  ] as const)(
    'resolves pedometer=%s health=%s to %s',
    (pedometerEnabled, healthEnabled, expected) => {
      expect(getTrackingModeForSources(pedometerEnabled, healthEnabled)).toBe(
        expected,
      );
    },
  );
});
