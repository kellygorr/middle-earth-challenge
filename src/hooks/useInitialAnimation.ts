import { useCallback, useEffect, useRef } from 'react';
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

const PATH_REVEAL_WATCHDOG_BUFFER_MS = 1000;

interface UseInitialAnimationOptions {
  showWelcome: boolean;
  pathRevealStart?: number;
  // Latest sync state. When the welcome modal dismisses while a sync is in
  // progress, the path reveal animation is skipped (set to full) because
  // the screen already has competing motion (bg pulse, shimmer) and the
  // reveal is visually distracting on top of those.
  isSyncing?: boolean;
  recenterOpacity: SharedValue<number>;
  originMonitorEnabled: SharedValue<boolean>;
  resetToOrigin: () => void;
  // Fires ~1s after welcome dismisses. Used to surface the "Get started"
  // tooltip and begin observing miles changes — decoupled from path
  // reveal so first-run guidance shows quickly.
  onStartupReady?: () => void;
  // Fires when the base path reveal completes (or immediately if the
  // reveal was skipped due to in-flight sync). Used to switch the game
  // progress marker on so it doesn't animate along a still-drawing path.
  onPathRevealComplete?: () => void;
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
  pathRevealStart = 0,
  isSyncing = false,
  recenterOpacity,
  originMonitorEnabled,
  resetToOrigin,
  onStartupReady,
  onPathRevealComplete,
}: UseInitialAnimationOptions): UseInitialAnimationReturn {
  // Mirror `isSyncing` into a ref so changes don't retrigger the dismissal
  // effect; we only need its value at the moment welcome dismisses.
  const isSyncingRef = useRef(isSyncing);
  isSyncingRef.current = isSyncing;
  // Initial path reveal animation (0 to 1)
  const initialBasePathProgress = useSharedValue(
    showWelcome ? pathRevealStart : 1,
  );

  // UI button opacities
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const labelsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const infoOpacity = useSharedValue(showWelcome ? 0 : 1);

  // Sentinel shared value used purely to sequence the startup-ready
  // callback via `withDelay` — separate from any visible opacity so its
  // timing can be tuned without disturbing button entrance animation.
  const startupSignal = useSharedValue(showWelcome ? 0 : 1);

  // Track if animations have completed to prevent restarts
  const hasSettingsAnimated = useSharedValue(!showWelcome);
  const hasLabelsAnimated = useSharedValue(!showWelcome);
  const hasInfoAnimated = useSharedValue(!showWelcome);
  const hasPathRevealed = useSharedValue(!showWelcome);
  const hasStartupSignaled = useSharedValue(!showWelcome);
  const pathRevealCompletedRef = useRef(false);
  const startedWithoutWelcomeRef = useRef(!showWelcome);
  const pathRevealWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onPathRevealCompleteRef = useRef(onPathRevealComplete);
  onPathRevealCompleteRef.current = onPathRevealComplete;

  const clearPathRevealWatchdog = useCallback(() => {
    if (pathRevealWatchdogRef.current !== null) {
      clearTimeout(pathRevealWatchdogRef.current);
      pathRevealWatchdogRef.current = null;
    }
  }, []);

  const completePathReveal = useCallback(() => {
    if (pathRevealCompletedRef.current) return;
    pathRevealCompletedRef.current = true;
    clearPathRevealWatchdog();
    initialBasePathProgress.value = 1;
    onPathRevealCompleteRef.current?.();
  }, [clearPathRevealWatchdog, initialBasePathProgress]);

  useEffect(
    () => () => {
      clearPathRevealWatchdog();
    },
    [clearPathRevealWatchdog],
  );

  useEffect(() => {
    if (startedWithoutWelcomeRef.current) {
      completePathReveal();
    }
  }, [completePathReveal]);

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
          completePathReveal();
        } else {
          pathRevealWatchdogRef.current = setTimeout(
            completePathReveal,
            motion.pathReveal.delay +
              motion.pathReveal.duration +
              PATH_REVEAL_WATCHDOG_BUFFER_MS,
          );
          initialBasePathProgress.value = withDelay(
            motion.pathReveal.delay,
            withTiming(
              1,
              { duration: motion.pathReveal.duration },
              finished => {
                'worklet';
                if (finished) {
                  runOnJS(completePathReveal)();
                }
              },
            ),
          );
        }
      }

      // Info button appears immediately alongside settings so the user
      // can start interacting without waiting for the path reveal.
      if (!hasInfoAnimated.value) {
        hasInfoAnimated.value = true;
        infoOpacity.value = withTiming(1, {
          duration: motion.button.enterDuration,
        });
      }

      // Startup-ready signal: fires ~1s after welcome dismisses so the
      // "Get started" tooltip has a beat of breathing room after the
      // button fades in, rather than appearing simultaneously.
      if (!hasStartupSignaled.value) {
        hasStartupSignaled.value = true;
        startupSignal.value = withDelay(
          1000,
          withTiming(1, { duration: 1 }, finished => {
            'worklet';
            if (finished && onStartupReady) {
              runOnJS(onStartupReady)();
            }
          }),
        );
      }
    } else {
      // Reset opacities when welcome shows
      clearPathRevealWatchdog();
      cancelAnimation(settingsOpacity);
      cancelAnimation(labelsOpacity);
      cancelAnimation(infoOpacity);
      cancelAnimation(startupSignal);
      cancelAnimation(initialBasePathProgress);
      hasSettingsAnimated.value = false;
      hasLabelsAnimated.value = false;
      hasInfoAnimated.value = false;
      hasPathRevealed.value = false;
      hasStartupSignaled.value = false;
      pathRevealCompletedRef.current = false;
      settingsOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      labelsOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      infoOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      startupSignal.value = 0;

      // Hide recenter button and reset origin monitoring
      cancelAnimation(recenterOpacity);
      recenterOpacity.value = withTiming(0, {
        duration: motion.button.exitDuration,
      });
      originMonitorEnabled.value = true;

      // Reset map position
      resetToOrigin();

      // Hide path so it can re-run on next dismissal
      initialBasePathProgress.value = pathRevealStart;
    }
  }, [
    showWelcome,
    pathRevealStart,
    initialBasePathProgress,
    settingsOpacity,
    labelsOpacity,
    infoOpacity,
    startupSignal,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    hasSettingsAnimated,
    hasLabelsAnimated,
    hasInfoAnimated,
    hasPathRevealed,
    hasStartupSignaled,
    clearPathRevealWatchdog,
    completePathReveal,
    onStartupReady,
  ]);

  return {
    initialBasePathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  };
}
