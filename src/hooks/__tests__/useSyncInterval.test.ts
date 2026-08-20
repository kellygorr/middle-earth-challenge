import {
  getHealthLookbackStartForChunk,
  getHealthSyncFormatForChunk,
  getHealthSyncStartTimestamp,
} from '../../services/healthSyncCutover';

describe('Health Connect sync format cutover', () => {
  it('starts a null-cursor cutover from sync_start_date', () => {
    expect(getHealthSyncStartTimestamp(null, 100)).toBe(100);
  });

  it('resumes an interrupted cutover from its persisted cursor', () => {
    expect(getHealthSyncStartTimestamp(200, 100)).toBe(200);
    expect(getHealthSyncFormatForChunk('android', 0, 0, 2)).toBe(0);
  });

  it('does not overlap until a safe aggregate boundary is persisted', () => {
    expect(getHealthSyncStartTimestamp(500, 100, null, 300, 100)).toBe(500);
  });

  it('bounds and aligns lookback without crossing its safe floor', () => {
    expect(getHealthSyncStartTimestamp(950, 100, 250, 300, 100)).toBe(600);
    expect(getHealthSyncStartTimestamp(500, 100, 250, 300, 100)).toBe(250);
  });

  it('switches to aggregate IDs only on the final raw chunk', () => {
    expect(getHealthSyncFormatForChunk('android', 0, 1, 2)).toBe(1);
  });

  it('keeps aggregate mode after the cutover', () => {
    expect(getHealthSyncFormatForChunk('android', 1, 0, 3)).toBe(1);
  });

  it('starts replay after the final raw-ID cursor', () => {
    expect(
      getHealthLookbackStartForChunk('android', 0, 1, null, 100, 200),
    ).toBe(200);
  });

  it('does not establish replay during an intermediate raw-ID chunk', () => {
    expect(
      getHealthLookbackStartForChunk('android', 0, 0, null, 100, 200),
    ).toBeNull();
  });

  it('starts replay at the first aggregate chunk and preserves that floor', () => {
    expect(
      getHealthLookbackStartForChunk('android', 1, 1, null, 100, 200),
    ).toBe(100);
    expect(getHealthLookbackStartForChunk('android', 1, 1, 100, 200, 300)).toBe(
      100,
    );
  });
});
