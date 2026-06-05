import { useEffect, useRef } from 'react';
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
  // Latest sync state. When the welcome modal dismisses while a sync is in
  // progress, the path reveal animation is skipped (set to full) because
  // the screen already has competing motion (bg pulse, shimmer) and the
  // reveal is visually distracting on top of those.
  isSyncing?: boolean;
  recenterOpacity: SharedValue<number>;
  originMonitorEnabled: SharedValue<boolean>;
  resetToOrigin: () => void;
  onInfoAnimationComplete?: () => void;
}

interface UseInitialAnimationReturn {
  // Path reveal progress (0 to 1)
  initialBasePathProgress: SharedValue<number>;

  // Button opacity animated styles
  settingsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  labelsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  infoEnterStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useInitialAnimation({
  showWelcome,
  isSyncing = false,
  recenterOpacity,
  originMonitorEnabled,
  resetToOrigin,
  onInfoAnimationComplete,
}: UseInitialAnimationOptions): UseInitialAnimationReturn {
  // Mirror `isSyncing` into a ref so changes don't retrigger the dismissal
  // effect; we only need its value at the moment welcome dismisses.
  const isSyncingRef = useRef(isSyncing);
  isSyncingRef.current = isSyncing;
  // Initial path reveal animation (0 to 1)
  const initialBasePathProgress = useSharedValue(showWelcome ? 0 : 1);

  // UI button opacities
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const labelsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const infoOpacity = useSharedValue(showWelcome ? 0 : 1);

  // Track if animations have completed to prevent restarts
  const hasSettingsAnimated = useSharedValue(!showWelcome);
  const hasLabelsAnimated = useSharedValue(!showWelcome);
  const hasInfoAnimated = useSharedValue(!showWelcome);
  const hasPathRevealed = useSharedValue(!showWelcome);

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

      // Path reveal animation (only once — re-runs of this effect during
      // sync-driven re-renders would otherwise keep resetting the
      // withDelay and the reveal would never start until re-renders stop).
      // If a sync is already in progress at the moment welcome dismisses,
      // skip the reveal (jump straight to full) to avoid stacking motion
      // on top of the bg pulse + shimmer animations.
      if (!hasPathRevealed.value) {
        hasPathRevealed.value = true;
        if (isSyncingRef.current) {
          initialBasePathProgress.value = 1;
        } else {
          initialBasePathProgress.value = withDelay(
            motion.pathReveal.delay,
            withTiming(1, { duration: motion.pathReveal.duration }),
          );
        }
      }

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
      hasPathRevealed.value = false;
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
      initialBasePathProgress.value = 0;
    }
  }, [
    showWelcome,
    initialBasePathProgress,
    settingsOpacity,
    labelsOpacity,
    infoOpacity,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    hasSettingsAnimated,
    hasLabelsAnimated,
    hasInfoAnimated,
    hasPathRevealed,
    onInfoAnimationComplete,
  ]);

  return {
    initialBasePathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  };
}
