import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  cancelAnimation,
  SharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { motion } from '../styles/motion';

interface UseInitialAnimationOptions {
  showWelcome: boolean;
  recenterOpacity: SharedValue<number>;
  originMonitorEnabled: SharedValue<boolean>;
  resetToOrigin: () => void;
  onInfoAnimationComplete?: () => void;
}

interface UseInitialAnimationReturn {
  // Path reveal progress (0 to 1)
  initialPathProgress: SharedValue<number>;

  // Button opacity animated styles
  settingsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  labelsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  infoEnterStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useInitialAnimation({
  showWelcome,
  recenterOpacity,
  originMonitorEnabled,
  resetToOrigin,
  onInfoAnimationComplete,
}: UseInitialAnimationOptions): UseInitialAnimationReturn {
  // Initial path reveal animation (0 to 1)
  const initialPathProgress = useSharedValue(showWelcome ? 0 : 1);

  // UI button opacities
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const labelsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const infoOpacity = useSharedValue(showWelcome ? 0 : 1);

  // Track if animations have completed to prevent restarts
  const hasSettingsAnimated = useSharedValue(!showWelcome);
  const hasLabelsAnimated = useSharedValue(!showWelcome);
  const hasInfoAnimated = useSharedValue(!showWelcome);

  // Animated styles for buttons
  const settingsEnterStyle = useAnimatedStyle(() => ({
    opacity: settingsOpacity.value,
  }));

  const labelsEnterStyle = useAnimatedStyle(() => ({
    opacity: labelsOpacity.value,
  }));

  const infoEnterStyle = useAnimatedStyle(() => ({
    opacity: infoOpacity.value,
  }));

  // Watch for welcome modal dismissal to trigger animation
  useEffect(() => {
    if (!showWelcome) {
      // Settings animation (only once)
      if (!hasSettingsAnimated.value) {
        hasSettingsAnimated.value = true;
        settingsOpacity.value = 0;
        settingsOpacity.value = withTiming(1, {
          duration: motion.button.enterDuration,
        });
      }

      // Labels animation (only once)
      if (!hasLabelsAnimated.value) {
        hasLabelsAnimated.value = true;
        labelsOpacity.value = 0;
        labelsOpacity.value = withDelay(
          motion.button.enterDelayLabels,
          withTiming(1, {
            duration: motion.button.enterDuration,
          }),
        );
      }

      // Only reset info opacity if animation hasn't run yet
      if (!hasInfoAnimated.value) {
        infoOpacity.value = 0;
      }

      // Path reveal animation
      initialPathProgress.value = withDelay(
        motion.pathReveal.delay,
        withTiming(1, { duration: motion.pathReveal.duration }),
      );

      // Info button appears after path animation completes (only once)
      if (!hasInfoAnimated.value) {
        hasInfoAnimated.value = true;
        infoOpacity.value = withDelay(
          motion.pathReveal.delay +
            motion.pathReveal.duration +
            motion.modal.entranceDelay,
          withTiming(
            1,
            {
              duration: motion.button.enterDuration,
            },
            finished => {
              'worklet';
              if (finished && onInfoAnimationComplete) {
                runOnJS(onInfoAnimationComplete)();
              }
            },
          ),
        );
      }
    } else {
      // Reset opacities when welcome shows
      cancelAnimation(settingsOpacity);
      cancelAnimation(labelsOpacity);
      cancelAnimation(infoOpacity);
      hasSettingsAnimated.value = false;
      hasLabelsAnimated.value = false;
      hasInfoAnimated.value = false;
      settingsOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      labelsOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      infoOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });

      // Hide recenter button and reset origin monitoring
      cancelAnimation(recenterOpacity);
      recenterOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      originMonitorEnabled.value = true;

      // Reset map position
      resetToOrigin();

      // Hide path so it can re-run on next dismissal
      initialPathProgress.value = 0;
    }
  }, [
    showWelcome,
    initialPathProgress,
    settingsOpacity,
    labelsOpacity,
    infoOpacity,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    hasSettingsAnimated,
    hasLabelsAnimated,
    hasInfoAnimated,
    onInfoAnimationComplete,
  ]);

  return {
    initialPathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  };
}
