import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  cancelAnimation,
  SharedValue,
} from 'react-native-reanimated';
import { motion } from '../styles/motion';

interface UseInitialAnimationOptions {
  showWelcome: boolean;
  recenterOpacity: SharedValue<number>;
  originMonitorEnabled: SharedValue<boolean>;
  resetToOrigin: () => void;
}

interface UseInitialAnimationReturn {
  // Path reveal progress (0 to 1)
  initialPathProgress: SharedValue<number>;

  // Button opacity animated styles
  settingsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  labelsEnterStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useInitialAnimation({
  showWelcome,
  recenterOpacity,
  originMonitorEnabled,
  resetToOrigin,
}: UseInitialAnimationOptions): UseInitialAnimationReturn {
  // Initial path reveal animation (0 to 1)
  const initialPathProgress = useSharedValue(showWelcome ? 0 : 1);

  // UI button opacities
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const labelsOpacity = useSharedValue(showWelcome ? 0 : 1);

  // Animated styles for buttons
  const settingsEnterStyle = useAnimatedStyle(() => ({
    opacity: settingsOpacity.value,
  }));

  const labelsEnterStyle = useAnimatedStyle(() => ({
    opacity: labelsOpacity.value,
  }));

  // Watch for welcome modal dismissal to trigger animation
  useEffect(() => {
    if (!showWelcome) {
      // Fade in UI first (settings immediate, labels staggered)
      settingsOpacity.value = 0;
      labelsOpacity.value = 0;
      settingsOpacity.value = withTiming(1, {
        duration: motion.button.enterDuration,
      });
      labelsOpacity.value = withDelay(
        motion.button.enterDelayLabels,
        withTiming(1, {
          duration: motion.button.enterDuration,
        }),
      );

      // Then start path animation
      initialPathProgress.value = withDelay(
        motion.pathReveal.delay,
        withTiming(1, { duration: motion.pathReveal.duration }),
      );
    } else {
      // Reset opacities when welcome shows
      cancelAnimation(settingsOpacity);
      cancelAnimation(labelsOpacity);
      settingsOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      labelsOpacity.value = withTiming(0, {
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
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
  ]);

  return {
    initialPathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
  };
}
