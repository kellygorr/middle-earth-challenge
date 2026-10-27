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

interface UseInitialAnimationOptions {
  showWelcome: boolean;
  recenterOpacity: SharedValue<number>;
  originMonitorEnabled: SharedValue<boolean>;
  resetToOrigin: () => void;
  // Fires ~1s after welcome dismisses. Used to surface the "Get started"
  // tooltip and begin observing miles changes — decoupled from path
  // reveal so first-run guidance shows quickly.
  onStartupReady?: () => void;
  // Fires once the base path is marked fully drawn (immediately, on
  // welcome dismiss — the base path no longer animates in). Used to
  // switch the game progress marker on.
  onPathRevealComplete?: () => void;
}

interface UseInitialAnimationReturn {
  // Path reveal progress (0 to 1)
  initialBasePathProgress: SharedValue<number>;

  // Button opacity animated styles
  settingsEnterStyle: ReturnType<typeof useAnimatedStyle>;
  infoEnterStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useInitialAnimation({
  showWelcome,
  recenterOpacity,
  originMonitorEnabled,
  resetToOrigin,
  onStartupReady,
  onPathRevealComplete,
}: UseInitialAnimationOptions): UseInitialAnimationReturn {
  // Base/grey path is always fully drawn — no reveal animation and no
  // partial-draw state while welcome is showing either.
  const initialBasePathProgress = useSharedValue(1);

  // UI button opacities
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const infoOpacity = useSharedValue(showWelcome ? 0 : 1);

  // Sentinel shared value used purely to sequence the startup-ready
  // callback via `withDelay` — separate from any visible opacity so its
  // timing can be tuned without disturbing button entrance animation.
  const startupSignal = useSharedValue(showWelcome ? 0 : 1);

  // Track if animations have completed to prevent restarts
  const hasSettingsAnimated = useSharedValue(!showWelcome);
  const hasInfoAnimated = useSharedValue(!showWelcome);
  const hasPathRevealed = useSharedValue(!showWelcome);
  const hasStartupSignaled = useSharedValue(!showWelcome);
  const pathRevealCompletedRef = useRef(false);
  const startedWithoutWelcomeRef = useRef(!showWelcome);
  const onPathRevealCompleteRef = useRef(onPathRevealComplete);
  onPathRevealCompleteRef.current = onPathRevealComplete;

  const completePathReveal = useCallback(() => {
    if (pathRevealCompletedRef.current) return;
    pathRevealCompletedRef.current = true;
    initialBasePathProgress.value = 1;
    onPathRevealCompleteRef.current?.();
  }, [initialBasePathProgress]);

  useEffect(() => {
    if (startedWithoutWelcomeRef.current) {
      completePathReveal();
    }
  }, [completePathReveal]);

  // Animated styles for buttons
  const settingsEnterStyle = useAnimatedStyle(() => ({
    opacity: settingsOpacity.value,
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

      // Only reset info opacity if animation hasn't run yet
      if (!hasInfoAnimated.value) {
        infoOpacity.value = 0;
      }

      // Path reveal animation (only once — re-runs of this effect during
      // sync-driven re-renders would otherwise keep re-triggering this
      // block). The grey base path no longer animates in on dismiss —
      // it jumps straight to fully drawn immediately, so only the
      // colored "active" progress path (see useGameProgressAnimation)
      // animates on dismiss.
      if (!hasPathRevealed.value) {
        hasPathRevealed.value = true;
        completePathReveal();
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
      cancelAnimation(settingsOpacity);
      cancelAnimation(infoOpacity);
      cancelAnimation(startupSignal);
      hasSettingsAnimated.value = false;
      hasInfoAnimated.value = false;
      hasPathRevealed.value = false;
      hasStartupSignaled.value = false;
      pathRevealCompletedRef.current = false;
      settingsOpacity.value = withTiming(0, {
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
    }
  }, [
    showWelcome,
    initialBasePathProgress,
    settingsOpacity,
    infoOpacity,
    startupSignal,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    hasSettingsAnimated,
    hasInfoAnimated,
    hasPathRevealed,
    hasStartupSignaled,
    completePathReveal,
    onStartupReady,
  ]);

  return {
    initialBasePathProgress,
    settingsEnterStyle,
    infoEnterStyle,
  };
}
