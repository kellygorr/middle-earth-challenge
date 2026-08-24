import { act, renderHook } from '@testing-library/react-native';
import { withTiming, type SharedValue } from 'react-native-reanimated';

import { useInitialAnimation } from '../useInitialAnimation';
import { motion } from '../../styles/motion';

const sharedValue = <T>(value: T) => ({ value } as SharedValue<T>);
type HookResult = ReturnType<typeof useInitialAnimation>;
type HookProps = { showWelcome: boolean };

describe('useInitialAnimation path reveal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    (withTiming as jest.Mock).mockImplementation(toValue => toValue);
    jest.useRealTimers();
  });

  it('forces the full path visible when the animation callback never fires', async () => {
    const onPathRevealComplete = jest.fn();
    const options = {
      isSyncing: false,
      recenterOpacity: sharedValue(0),
      originMonitorEnabled: sharedValue(true),
      resetToOrigin: jest.fn(),
      onPathRevealComplete,
    };
    const { result, rerender } = await renderHook<HookResult, HookProps>(
      ({ showWelcome }) => useInitialAnimation({ ...options, showWelcome }),
      { initialProps: { showWelcome: true } },
    );

    await rerender({ showWelcome: false });
    expect(onPathRevealComplete).not.toHaveBeenCalled();

    await rerender({ showWelcome: false });
    expect(onPathRevealComplete).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(
        motion.pathReveal.delay + motion.pathReveal.duration + 1000,
      );
    });

    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('starts the path at the supplied off-screen edge point', async () => {
    const { result } = await renderHook(() =>
      useInitialAnimation({
        showWelcome: true,
        pathRevealStart: 0.25,
        recenterOpacity: sharedValue(0),
        originMonitorEnabled: sharedValue(true),
        resetToOrigin: jest.fn(),
      }),
    );

    expect(result.current.initialBasePathProgress.value).toBe(0.25);
  });

  it('cancels the fallback when onboarding is shown again', async () => {
    const onPathRevealComplete = jest.fn();
    const { rerender } = await renderHook<HookResult, HookProps>(
      ({ showWelcome }) =>
        useInitialAnimation({
          showWelcome,
          recenterOpacity: sharedValue(0),
          originMonitorEnabled: sharedValue(true),
          resetToOrigin: jest.fn(),
          onPathRevealComplete,
        }),
      { initialProps: { showWelcome: true } },
    );

    await rerender({ showWelcome: false });
    await rerender({ showWelcome: true });
    await act(() => {
      jest.runAllTimers();
    });

    expect(onPathRevealComplete).not.toHaveBeenCalled();
  });

  it('does not replay the path when the map mounts without welcome', async () => {
    const onPathRevealComplete = jest.fn();
    const { result } = await renderHook(() =>
      useInitialAnimation({
        showWelcome: false,
        pathRevealStart: 0.25,
        recenterOpacity: sharedValue(0),
        originMonitorEnabled: sharedValue(true),
        resetToOrigin: jest.fn(),
        onPathRevealComplete,
      }),
    );

    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('does not run the fallback after normal animation completion', async () => {
    (withTiming as jest.Mock).mockImplementation(
      (toValue, _config, callback) => {
        callback?.(true);
        return toValue;
      },
    );
    const onPathRevealComplete = jest.fn();
    const { rerender } = await renderHook<HookResult, HookProps>(
      ({ showWelcome }) =>
        useInitialAnimation({
          showWelcome,
          recenterOpacity: sharedValue(0),
          originMonitorEnabled: sharedValue(true),
          resetToOrigin: jest.fn(),
          onPathRevealComplete,
        }),
      { initialProps: { showWelcome: true } },
    );

    await rerender({ showWelcome: false });
    await act(() => {
      jest.runAllTimers();
    });

    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);
  });
});
