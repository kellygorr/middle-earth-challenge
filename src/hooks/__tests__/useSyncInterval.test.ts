import { AppState, Platform, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  isSyncRunnerMounted,
  requestSyncNow,
  useSyncInterval,
} from '../useSyncInterval';
import { useInitializationStore } from '../../stores/initializationStore';
import {
  initialSyncStatus,
  useProgressStore,
  type SyncStatus,
} from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';
import * as fitnessServiceModule from '../../services/fitnessService';
import { pedometerService } from '../../services/pedometerService';
import * as pedometerCommitModule from '../../services/pedometerCommit';
import { database } from '../../services/database';
import type { HealthDistanceRecord } from '../../types';
import {
  CHUNK_RETRY_DELAY_MS,
  CHUNK_TIMEOUT_MS,
  SYNC_INTERVAL_MS,
} from '../../constants/sync';

const NOW = 1_800_000_000_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('useSyncInterval lifecycle', () => {
  const initializeFitness = jest.fn();
  const readRecords = jest.fn();
  const readLegacyRecords = jest.fn();
  const applyHealthSyncChunk = jest.fn();
  const persistMilesSnapshot = jest.fn();
  const updateSyncSettings = jest.fn();
  const setSyncStatus = jest.fn();
  let appStateListener: ((state: AppStateStatus) => void) | null;
  let removeAppStateListener: jest.Mock;
  let appStateDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    appStateListener = null;
    removeAppStateListener = jest.fn();
    appStateDescriptor = Object.getOwnPropertyDescriptor(
      AppState,
      'currentState',
    );
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });

    const addEventListener = jest.spyOn(
      AppState,
      'addEventListener',
    ) as unknown as jest.Mock;
    addEventListener.mockImplementation(
      (_event: string, listener: (state: AppStateStatus) => void) => {
        appStateListener = listener;
        return { remove: removeAppStateListener };
      },
    );

    initializeFitness.mockResolvedValue(undefined);
    readRecords.mockResolvedValue([]);
    readLegacyRecords.mockResolvedValue([]);
    applyHealthSyncChunk.mockResolvedValue(true);
    persistMilesSnapshot.mockResolvedValue(undefined);
    updateSyncSettings.mockImplementation(async updates => {
      useSettingsStore.setState(updates);
    });
    setSyncStatus.mockImplementation(
      (status: SyncStatus | ((previous: SyncStatus) => SyncStatus)) => {
        const previous = useProgressStore.getState().syncStatus;
        useProgressStore.setState({
          syncStatus: typeof status === 'function' ? status(previous) : status,
        });
      },
    );

    jest
      .spyOn(fitnessServiceModule, 'getActiveFitnessService')
      .mockReturnValue({
        initialize: initializeFitness,
        getDistanceRecordsBetween: readRecords,
        getLegacyDistanceRecordsBetween: readLegacyRecords,
      } as unknown as fitnessServiceModule.FitnessServiceInterface);
    jest.spyOn(database, 'getDistanceEntriesByIds').mockResolvedValue([]);
    jest.spyOn(pedometerService, 'isSupported').mockReturnValue(true);
    jest.spyOn(pedometerService, 'isServiceRunning').mockResolvedValue(true);
    jest
      .spyOn(pedometerCommitModule, 'commitPedometerRange')
      .mockResolvedValue({ steps: 0, miles: 0, entryWritten: false });

    useInitializationStore.setState({ phase: 'loading' });
    useSettingsStore.setState({
      syncEnabled: true,
      liveSyncEnabled: false,
      syncProvider: Platform.OS === 'ios' ? 'apple-health' : 'health-connect',
      syncStartDate: NOW - 60_000,
      lastSyncTimestamp: null,
      healthSyncFormatVersion: 1,
      healthLookbackStartTimestamp: null,
      trackingMode: 'health-app',
      updateSyncSettings,
    });
    useProgressStore.setState({
      syncStatus: initialSyncStatus,
      setSyncStatus,
      applyHealthSyncChunk,
      persistMilesSnapshot,
    });
  });

  afterEach(() => {
    if (appStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', appStateDescriptor);
    } else {
      delete (AppState as { currentState?: AppStateStatus }).currentState;
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('gates automatic and manual sync until initialization is ready', async () => {
    await renderHook(() => useSyncInterval());

    await requestSyncNow();
    expect(initializeFitness).not.toHaveBeenCalled();

    await act(() => {
      useInitializationStore.setState({ phase: 'ready' });
    });
    await waitFor(() => expect(initializeFitness).toHaveBeenCalledTimes(1));
  });

  it('keeps manual and foreground triggers behind one in-flight sync', async () => {
    const pendingRead = deferred<[]>();
    readRecords.mockReturnValue(pendingRead.promise);
    useSettingsStore.setState({ liveSyncEnabled: true });
    useInitializationStore.setState({ phase: 'ready' });

    await renderHook(() => useSyncInterval());
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));

    await act(async () => {
      await requestSyncNow();
      appStateListener?.('background');
      appStateListener?.('active');
    });
    expect(readRecords).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRead.resolve([]);
      await pendingRead.promise;
      await Promise.resolve();
    });
    await waitFor(() => expect(applyHealthSyncChunk).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(persistMilesSnapshot).toHaveBeenCalledTimes(1));
  });

  it('discards a health result when ownership switches to dual mode', async () => {
    const pendingRead = deferred<HealthDistanceRecord[]>();
    readRecords.mockReturnValue(pendingRead.promise);
    useInitializationStore.setState({ phase: 'ready' });

    await renderHook(() => useSyncInterval());
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));

    await act(() => {
      useSettingsStore.setState({ trackingMode: 'dual' });
    });
    await act(async () => {
      pendingRead.resolve([
        {
          id: 'late-health-row',
          startTime: new Date(NOW - 1_000).toISOString(),
          endTime: new Date(NOW).toISOString(),
          distanceMeters: 2,
          steps: 3,
        },
      ]);
      await pendingRead.promise;
    });

    await waitFor(() =>
      expect(database.getDistanceEntriesByIds).toHaveBeenCalledTimes(1),
    );
    expect(applyHealthSyncChunk).not.toHaveBeenCalled();
  });

  it('times out without retrying or advancing the cursor', async () => {
    readRecords.mockReturnValue(new Promise(() => {}));
    useInitializationStore.setState({ phase: 'ready' });

    await renderHook(() => useSyncInterval());
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CHUNK_TIMEOUT_MS);
    });

    expect(readRecords).toHaveBeenCalledTimes(1);
    expect(applyHealthSyncChunk).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().lastSyncTimestamp).toBeNull();
    expect(useProgressStore.getState().syncStatus).toMatchObject({
      phase: 'error',
      error: { kind: 'timeout' },
    });
  });

  it('retries one settled transient provider failure', async () => {
    readRecords
      .mockRejectedValueOnce(new Error('provider busy'))
      .mockResolvedValueOnce([]);
    useInitializationStore.setState({ phase: 'ready' });

    await renderHook(() => useSyncInterval());
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CHUNK_RETRY_DELAY_MS);
    });

    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(applyHealthSyncChunk).toHaveBeenCalled());
  });

  it('stops background polling, refreshes on foreground, and cleans up', async () => {
    useSettingsStore.setState({ liveSyncEnabled: true });
    useInitializationStore.setState({ phase: 'ready' });
    const { unmount } = await renderHook(() => useSyncInterval());
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    await act(() => appStateListener?.('background'));
    const readsBeforeBackground = readRecords.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    });
    expect(readRecords).toHaveBeenCalledTimes(readsBeforeBackground);

    await act(() => appStateListener?.('active'));
    await waitFor(() =>
      expect(readRecords).toHaveBeenCalledTimes(readsBeforeBackground + 1),
    );

    await unmount();
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    expect(isSyncRunnerMounted()).toBe(false);
    const readsAtUnmount = readRecords.mock.calls.length;
    await requestSyncNow();
    expect(readRecords).toHaveBeenCalledTimes(readsAtUnmount);
  });

  it('publishes permission failures and disables health sync', async () => {
    const permissionError = new Error('SecurityException: permission denied');
    initializeFitness.mockRejectedValue(permissionError);
    useInitializationStore.setState({ phase: 'ready' });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await renderHook(() => useSyncInterval());

    await waitFor(() =>
      expect(useProgressStore.getState().syncStatus).toMatchObject({
        phase: 'error',
        error: { kind: 'permission' },
      }),
    );
    expect(updateSyncSettings).toHaveBeenCalledWith({ syncEnabled: false });
  });

  it('preserves the pedometer watermark when a commit fails', async () => {
    const watermark = NOW - 1_000;
    useSettingsStore.setState({
      syncEnabled: false,
      trackingMode: 'pedometer',
      lastSyncTimestamp: watermark,
    });
    useInitializationStore.setState({ phase: 'ready' });
    jest
      .spyOn(pedometerCommitModule, 'commitPedometerRange')
      .mockRejectedValue(new Error('native read failed'));

    await renderHook(() => useSyncInterval());

    await waitFor(() =>
      expect(useProgressStore.getState().syncStatus).toMatchObject({
        phase: 'error',
        error: { kind: 'unknown' },
      }),
    );
    expect(pedometerCommitModule.commitPedometerRange).toHaveBeenCalledWith(
      watermark,
      NOW,
    );
    expect(useSettingsStore.getState().lastSyncTimestamp).toBe(watermark);
  });
});
