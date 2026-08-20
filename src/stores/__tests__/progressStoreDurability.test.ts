import { database } from '../../services/database';
import type { DistanceEntry } from '../../types';
import { useProgressStore } from '../progressStore';

const entry: DistanceEntry = {
  id: 'manual-1',
  saveId: 'default',
  date: 1,
  miles: 2,
  steps: 4_000,
  source: 'manual-distance',
};

describe('progressStore durability', () => {
  const applyChanges = jest.spyOn(database, 'applyDistanceEntryChanges');

  beforeEach(() => {
    jest.clearAllMocks();
    useProgressStore.setState({
      miles: 10,
      steps: 20_000,
      distanceEntries: [],
      syncStatus: {
        phase: 'idle',
        chunksDone: 0,
        chunksTotal: 0,
        milesAdded: 0,
        startedAt: null,
        lastProgressAt: null,
        error: null,
      },
      lastSyncError: null,
      lastSyncErrorAt: null,
    });
  });

  it('publishes committed database state after an entry write', async () => {
    applyChanges.mockResolvedValue({
      miles: 12,
      steps: 24_000,
      entries: [entry],
    });

    await useProgressStore.getState().addDistanceEntry(entry);

    expect(useProgressStore.getState()).toMatchObject({
      miles: 12,
      steps: 24_000,
      distanceEntries: [entry],
    });
  });

  it('does not mutate memory when the database transaction fails', async () => {
    applyChanges.mockRejectedValue(new Error('disk full'));

    await expect(
      useProgressStore.getState().addDistanceEntry(entry),
    ).rejects.toThrow('disk full');

    expect(useProgressStore.getState()).toMatchObject({
      miles: 10,
      steps: 20_000,
      distanceEntries: [],
    });
  });

  it('retains provider failures for the Settings error banner', () => {
    useProgressStore.getState().setSyncStatus({
      phase: 'error',
      chunksDone: 0,
      chunksTotal: 1,
      milesAdded: 0,
      startedAt: 1,
      lastProgressAt: 1,
      error: {
        kind: 'provider',
        provider: 'health-connect',
        message: 'native query failed',
      },
    });

    expect(useProgressStore.getState().lastSyncError).toMatchObject({
      kind: 'provider',
      provider: 'health-connect',
    });
    expect(useProgressStore.getState().lastSyncErrorAt).not.toBeNull();
  });
});
