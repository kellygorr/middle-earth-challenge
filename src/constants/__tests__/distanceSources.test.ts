import {
  getDistanceSourceLabel,
  isManualDistanceSource,
  isSyncedDistanceSource,
  MANUAL_DISTANCE_SOURCES,
} from '../distanceSources';

describe('distance source categories', () => {
  it('classifies every manual source used by LIVE and NEW', () => {
    expect(MANUAL_DISTANCE_SOURCES).toEqual([
      'manual',
      'manual-distance',
      'manual-steps',
    ]);
    expect(MANUAL_DISTANCE_SOURCES.every(isManualDistanceSource)).toBe(true);
  });

  it('classifies all non-manual sources as synced', () => {
    expect(isSyncedDistanceSource('health-connect')).toBe(true);
    expect(isSyncedDistanceSource('future-provider')).toBe(true);
  });

  it('labels legacy and reconciliation sources without calling them manual', () => {
    expect(getDistanceSourceLabel('synced')).toBe('Synced');
    expect(getDistanceSourceLabel('health-reconciliation')).toBe(
      'Health adjustment',
    );
    expect(getDistanceSourceLabel('future-provider')).toBe('Synced');
  });
});
