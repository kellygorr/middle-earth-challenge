import { renderHook } from '@testing-library/react-native';
import { type SharedValue } from 'react-native-reanimated';

import { useInitialAnimation } from '../useInitialAnimation';

const sharedValue = <T>(value: T) => ({ value } as SharedValue<T>);
type HookResult = ReturnType<typeof useInitialAnimation>;
type HookProps = { showWelcome: boolean };

describe('useInitialAnimation path reveal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('is always fully drawn while welcome is showing — no reveal animation, no partial-draw state', async () => {
    const { result } = await renderHook(() =>
      useInitialAnimation({
        showWelcome: true,
        recenterOpacity: sharedValue(0),
        originMonitorEnabled: sharedValue(true),
        resetToOrigin: jest.fn(),
      }),
    );

    expect(result.current.initialBasePathProgress.value).toBe(1);
  });

  it('fires the completion callback exactly once when welcome dismisses', async () => {
    const onPathRevealComplete = jest.fn();
    const options = {
      recenterOpacity: sharedValue(0),
      originMonitorEnabled: sharedValue(true),
      resetToOrigin: jest.fn(),
      onPathRevealComplete,
    };
    const { result, rerender } = await renderHook<HookResult, HookProps>(
      ({ showWelcome }) => useInitialAnimation({ ...options, showWelcome }),
      { initialProps: { showWelcome: true } },
    );

    expect(onPathRevealComplete).not.toHaveBeenCalled();

    await rerender({ showWelcome: false });

    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);
  });

  it('stays fully drawn and fires completion again each time welcome is dismissed', async () => {
    const onPathRevealComplete = jest.fn();
    const { result, rerender } = await renderHook<HookResult, HookProps>(
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
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);

    await rerender({ showWelcome: true });

    // Re-showing welcome never hides the base path again — it stays
    // fully drawn the whole time — and does not re-fire the completion
    // callback just from being shown again.
    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);

    await rerender({ showWelcome: false });
    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(2);
  });

  it('does not replay the path when the map mounts without welcome', async () => {
    const onPathRevealComplete = jest.fn();
    const { result } = await renderHook(() =>
      useInitialAnimation({
        showWelcome: false,
        recenterOpacity: sharedValue(0),
        originMonitorEnabled: sharedValue(true),
        resetToOrigin: jest.fn(),
        onPathRevealComplete,
      }),
    );

    expect(result.current.initialBasePathProgress.value).toBe(1);
    expect(onPathRevealComplete).toHaveBeenCalledTimes(1);
  });
});
