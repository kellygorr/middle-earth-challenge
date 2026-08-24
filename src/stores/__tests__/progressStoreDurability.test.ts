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
  const reconcileProgress = jest.spyOn(database, 'reconcileProgress');
  const saveSyncIssues = jest.spyOn(database, 'saveSyncIssues');

  beforeEach(() => {
    jest.clearAllMocks();
    saveSyncIssues.mockResolvedValue(undefined);
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
      syncIssues: [],
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

  it('does not mutate memory when snapshot reconciliation fails', async () => {
    reconcileProgress.mockRejectedValue(new Error('snapshot write failed'));

    await expect(
      useProgressStore.getState().persistMilesSnapshot(),
    ).rejects.toThrow('snapshot write failed');

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

    expect(useProgressStore.getState().syncIssues).toHaveLength(1);
    expect(useProgressStore.getState().syncIssues[0].error).toMatchObject({
      kind: 'provider',
      provider: 'health-connect',
    });
    expect(useProgressStore.getState().syncIssues[0].at).toBeGreaterThan(0);
  });

  describe('sync issue lifecycle', () => {
    const providerError = {
      kind: 'provider' as const,
      provider: 'health-connect' as const,
      message: 'native query failed',
    };

    it('keeps dismissal sticky when the same fault recurs', () => {
      useProgressStore.getState().addSyncIssue(providerError);
      useProgressStore.getState().dismissSyncIssue('health-app');
      const dismissedAt = useProgressStore.getState().syncIssues[0].dismissedAt;

      useProgressStore.getState().addSyncIssue({
        ...providerError,
        message: 'failed again',
      });

      expect(dismissedAt).not.toBeNull();
      expect(useProgressStore.getState().syncIssues[0]).toMatchObject({
        error: { kind: 'provider', message: 'failed again' },
        dismissedAt,
        resolvedAt: null,
      });
    });

    it('shows a different fault that replaces a dismissed slot', () => {
      useProgressStore.getState().addSyncIssue(providerError);
      useProgressStore.getState().dismissSyncIssue('health-app');

      useProgressStore.getState().addSyncIssue({
        kind: 'unavailable',
        message: 'Health Connect missing',
      });

      expect(useProgressStore.getState().syncIssues).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ kind: 'unavailable' }),
          dismissedAt: null,
          resolvedAt: null,
        }),
      ]);
    });

    it('resolves only active issues', () => {
      useProgressStore.getState().addSyncIssue(providerError);
      useProgressStore.getState().resolveSyncIssue('health-app');

      expect(
        useProgressStore.getState().syncIssues[0].resolvedAt,
      ).not.toBeNull();

      useProgressStore.setState({ syncIssues: [] });
      useProgressStore.getState().addSyncIssue(providerError);
      useProgressStore.getState().dismissSyncIssue('health-app');
      useProgressStore.getState().resolveSyncIssue('health-app');

      expect(useProgressStore.getState().syncIssues[0]).toMatchObject({
        dismissedAt: expect.any(Number),
        resolvedAt: null,
      });
    });

    it('restores a dismissed issue to the active banner', () => {
      useProgressStore.getState().addSyncIssue(providerError);
      useProgressStore.getState().dismissSyncIssue('health-app');

      useProgressStore.getState().restoreSyncIssue('health-app');

      expect(useProgressStore.getState().syncIssues[0]).toMatchObject({
        dismissedAt: null,
        resolvedAt: null,
      });
    });
  });
});
