import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import {
  useLivePedometerDelta,
  useLivePedometerDeltaOwner,
  useLivePedometerDeltaStore,
} from '../useLivePedometerDelta';
import { PEDOMETER_DISPLAY_REFRESH_MS } from '../../constants/sync';
import { useSettingsStore } from '../../stores/settingsStore';

const mockGetStepsBetween = jest.fn();
const mockGetStepsSinceCursor = jest.fn();
const mockIsSupported = jest.fn(() => true);

jest.mock('../../services/pedometerService', () => ({
  pedometerService: {
    isSupported: () => mockIsSupported(),
    getStepsBetween: (...args: unknown[]) => mockGetStepsBetween(...args),
    getStepsSinceCursor: (...args: unknown[]) =>
      mockGetStepsSinceCursor(...args),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('useLivePedometerDelta', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null;
  let removeAppStateListener: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    appStateListener = null;
    removeAppStateListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type,
      listener,
    ) => {
      appStateListener = listener;
      return { remove: removeAppStateListener };
    }) as typeof AppState.addEventListener);
    useSettingsStore.setState({
      trackingMode: 'pedometer',
      lastSyncTimestamp: 100,
      pedometerCursor: null,
    });
    useLivePedometerDeltaStore.setState({ steps: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('serves two consumers from one non-overlapping polling owner', async () => {
    const firstRead = deferred<{
      steps: number;
      fromMs: number;
      toMs: number;
    }>();
    mockGetStepsBetween
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValue({ steps: 13, fromMs: 100, toMs: 300 });

    const { result } = await renderHook(() => {
      useLivePedometerDeltaOwner();
      return [useLivePedometerDelta(), useLivePedometerDelta()];
    });

    expect(mockGetStepsBetween).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(PEDOMETER_DISPLAY_REFRESH_MS);
      appStateListener?.('active');
    });
    expect(mockGetStepsBetween).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRead.resolve({ steps: 12, fromMs: 100, toMs: 200 });
      await firstRead.promise;
    });
    expect(result.current).toEqual([12, 12]);

    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });
    expect(mockGetStepsBetween).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual([13, 13]);
  });

  it('discards an in-flight result after the watermark changes', async () => {
    const staleRead = deferred<{
      steps: number;
      fromMs: number;
      toMs: number;
    }>();
    mockGetStepsBetween
      .mockReturnValueOnce(staleRead.promise)
      .mockResolvedValue({ steps: 9, fromMs: 200, toMs: 300 });

    const { result } = await renderHook(() => {
      useLivePedometerDeltaOwner();
      return useLivePedometerDelta();
    });
    await act(() => {
      useSettingsStore.setState({ lastSyncTimestamp: 200 });
    });
    await act(async () => {
      staleRead.resolve({ steps: 99, fromMs: 100, toMs: 200 });
      await staleRead.promise;
    });
    expect(result.current).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(PEDOMETER_DISPLAY_REFRESH_MS);
      await Promise.resolve();
    });
    expect(mockGetStepsBetween).toHaveBeenLastCalledWith(
      200,
      expect.any(Number),
    );
    expect(result.current).toBe(9);
  });

  it('removes the app-state listener and ignores completion after unmount', async () => {
    const pendingRead = deferred<{
      steps: number;
      fromMs: number;
      toMs: number;
    }>();
    mockGetStepsBetween.mockReturnValue(pendingRead.promise);
    const { unmount } = await renderHook(() => {
      useLivePedometerDeltaOwner();
      return useLivePedometerDelta();
    });

    await unmount();
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingRead.resolve({ steps: 50, fromMs: 100, toMs: 200 });
      await pendingRead.promise;
    });
    expect(useLivePedometerDeltaStore.getState().steps).toBe(0);
  });
});
