import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export const STEP_COUNT_HIGHLIGHT_FADE_MS = 200;
export const STEP_COUNT_HIGHLIGHT_HOLD_MS = 600;

export function useStepCountHighlight(
  stepCount: number,
  normalColor: string,
  highlightColor: string,
) {
  const previousStepCount = useRef(stepCount);
  const highlightProgress = useSharedValue(0);

  useEffect(() => {
    if (previousStepCount.current === stepCount) return;

    previousStepCount.current = stepCount;
    cancelAnimation(highlightProgress);
    highlightProgress.value = 0;
    highlightProgress.value = withSequence(
      withTiming(1, { duration: STEP_COUNT_HIGHLIGHT_FADE_MS }),
      withDelay(
        STEP_COUNT_HIGHLIGHT_HOLD_MS,
        withTiming(0, { duration: STEP_COUNT_HIGHLIGHT_FADE_MS }),
      ),
    );
    return () => cancelAnimation(highlightProgress);
  }, [highlightProgress, stepCount]);

  return useAnimatedStyle(
    () => ({
      color: interpolateColor(
        highlightProgress.value,
        [0, 1],
        [normalColor, highlightColor],
      ),
    }),
    [highlightColor, normalColor],
  );
}
