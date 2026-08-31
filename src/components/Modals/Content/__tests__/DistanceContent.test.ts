import type { DistanceEntry } from '../../../../types';
import { LIVE_ENTRY_ID, isCurrentPedometerEntry } from '../DistanceContent';

function entry(id: string, source: DistanceEntry['source']): DistanceEntry {
  return {
    id,
    saveId: 'default',
    date: Date.now(),
    miles: 0,
    steps: 0,
    source,
  };
}

describe('DistanceContent row status', () => {
  it('marks only the latest synthetic pedometer row as current', () => {
    const committedPedometer = entry('pedo_committed', 'pedometer');
    const healthConnect = entry('hc_today', 'health-connect');
    const livePedometer = entry(LIVE_ENTRY_ID, 'pedometer');
    const entries = [committedPedometer, healthConnect, livePedometer];

    expect(isCurrentPedometerEntry(committedPedometer, 0, entries)).toBe(false);
    expect(isCurrentPedometerEntry(healthConnect, 1, entries)).toBe(false);
    expect(isCurrentPedometerEntry(livePedometer, 2, entries)).toBe(true);
  });

  it('does not mark a misplaced or non-pedometer live row as current', () => {
    const livePedometer = entry(LIVE_ENTRY_ID, 'pedometer');
    const committedPedometer = entry('pedo_committed', 'pedometer');
    const healthConnect = entry(LIVE_ENTRY_ID, 'health-connect');

    expect(
      isCurrentPedometerEntry(livePedometer, 0, [
        livePedometer,
        committedPedometer,
      ]),
    ).toBe(false);
    expect(isCurrentPedometerEntry(healthConnect, 0, [healthConnect])).toBe(
      false,
    );
  });
});
