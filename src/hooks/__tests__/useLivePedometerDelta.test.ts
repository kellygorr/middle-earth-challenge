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

    // Changing the watermark tears down the old effect (which resets the
    // in-flight guard along with the generation counter) and immediately
    // starts a fresh refresh() in the new one, without waiting for the
    // still-pending stale request to settle first.
    await act(() => {
      useSettingsStore.setState({ lastSyncTimestamp: 200 });
    });
    expect(mockGetStepsBetween).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(9);

    // The stale request finally resolving afterward must not clobber the
    // already-correct value with its outdated result.
    await act(async () => {
      staleRead.resolve({ steps: 99, fromMs: 100, toMs: 200 });
      await staleRead.promise;
    });
    expect(result.current).toBe(9);

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

  it('does not permanently block refresh() when a request never settles before the watermark changes', async () => {
    // Regression test: if the effect's cleanup only bumped the generation
    // counter and didn't also reset the in-flight guard, a request that
    // never resolves at all (not just late) would leave inFlightRef stuck
    // forever, silently blocking every future refresh() call across this
    // hook's re-runs -- even after a mode/watermark switch spins up a
    // brand-new polling interval.
    const neverSettles = new Promise<{
      steps: number;
      fromMs: number;
      toMs: number;
    }>(() => {});
    mockGetStepsBetween
      .mockReturnValueOnce(neverSettles)
      .mockResolvedValue({ steps: 7, fromMs: 200, toMs: 300 });

    const { result } = await renderHook(() => {
      useLivePedometerDeltaOwner();
      return useLivePedometerDelta();
    });
    expect(mockGetStepsBetween).toHaveBeenCalledTimes(1);

    // Changing the watermark tears down and re-creates the effect while the
    // first request is still (and will remain) permanently pending. The new
    // effect's own refresh() runs immediately on mount -- if the guard were
    // left stuck by the old, abandoned promise, this call would never
    // happen and the value would freeze at its prior state forever.
    await act(() => {
      useSettingsStore.setState({ lastSyncTimestamp: 200 });
    });

    expect(mockGetStepsBetween).toHaveBeenCalledTimes(2);
    expect(mockGetStepsBetween).toHaveBeenLastCalledWith(
      200,
      expect.any(Number),
    );
    expect(result.current).toBe(7);
  });
});
