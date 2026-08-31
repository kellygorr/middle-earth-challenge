import { renderHook } from '@testing-library/react-native';
import {
  cancelAnimation,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  STEP_COUNT_HIGHLIGHT_FADE_MS,
  STEP_COUNT_HIGHLIGHT_HOLD_MS,
  useStepCountHighlight,
} from '../useStepCountHighlight';

describe('useStepCountHighlight', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not animate initial hydration', async () => {
    await renderHook(() => useStepCountHighlight(10, '#FFFFFF', '#fff597'));

    expect(withSequence).not.toHaveBeenCalled();
  });

  it('fades in, holds, and fades out over one second after a change', async () => {
    const { rerender } = await renderHook(
      ({ steps }: { steps: number }) =>
        useStepCountHighlight(steps, '#FFFFFF', '#fff597'),
      { initialProps: { steps: 10 } },
    );

    await rerender({ steps: 11 });

    expect(withTiming).toHaveBeenNthCalledWith(1, 1, {
      duration: STEP_COUNT_HIGHLIGHT_FADE_MS,
    });
    expect(withTiming).toHaveBeenNthCalledWith(2, 0, {
      duration: STEP_COUNT_HIGHLIGHT_FADE_MS,
    });
    expect(withDelay).toHaveBeenCalledWith(STEP_COUNT_HIGHLIGHT_HOLD_MS, 0);
    expect(withSequence).toHaveBeenCalledWith(1, 0);
  });

  it('cancels and restarts the cue when the count changes again', async () => {
    const { rerender } = await renderHook(
      ({ steps }: { steps: number }) =>
        useStepCountHighlight(steps, '#FFFFFF', '#fff597'),
      { initialProps: { steps: 10 } },
    );

    await rerender({ steps: 11 });
    await rerender({ steps: 12 });

    expect(cancelAnimation).toHaveBeenCalled();
    expect(withSequence).toHaveBeenCalledTimes(2);
  });
});
