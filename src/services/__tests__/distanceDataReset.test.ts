import { database } from '../database';
import { resetDistanceData } from '../distanceDataReset';
import { useProgressStore } from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';

const manualEntry = {
  id: 'manual-1',
  saveId: 'default',
  date: 1_000,
  miles: 3,
  steps: 6_000,
  source: 'manual-distance' as const,
};

const resetResult = {
  miles: 3,
  steps: 6_000,
  changes: { removeSources: ['health-connect' as const] },
};

describe('resetDistanceData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes progress and bookmarks after the atomic reset commits', async () => {
    const resetAt = new Date(2026, 7, 25, 15).getTime();
    const reconciliationBoundary = new Date(2026, 7, 25).getTime();
    const resetSpy = jest
      .spyOn(database, 'resetDistanceData')
      .mockResolvedValue(resetResult);
    useProgressStore.setState({
      distanceEntries: [
        manualEntry,
        {
          ...manualEntry,
          id: 'health-1',
          source: 'health-connect',
        },
      ],
    });

    await resetDistanceData({
      removeSources: ['health-connect'],
      resetAt,
    });

    expect(resetSpy).toHaveBeenCalledWith(
      'default',
      { clearAll: false, removeSources: ['health-connect'] },
      resetAt,
      reconciliationBoundary,
    );
    expect(useProgressStore.getState()).toMatchObject({
      miles: 3,
      steps: 6_000,
      distanceEntries: [manualEntry],
      syncStatus: { phase: 'idle' },
    });
    expect(useSettingsStore.getState()).toMatchObject({
      syncStartDate: resetAt,
      lastSyncTimestamp: null,
      healthLookbackStartTimestamp: resetAt,
      lastHealthReconciledThrough: reconciliationBoundary,
    });
  });

  it('does not publish either store when the atomic reset fails', async () => {
    const progressBefore = useProgressStore.getState();
    const settingsBefore = useSettingsStore.getState();
    jest
      .spyOn(database, 'resetDistanceData')
      .mockRejectedValue(new Error('reset failed'));

    await expect(
      resetDistanceData({ clearAll: true, resetAt: 2_000 }),
    ).rejects.toThrow('reset failed');

    expect(useProgressStore.getState()).toBe(progressBefore);
    expect(useSettingsStore.getState()).toBe(settingsBefore);
  });
});
