import { useEffect, useState, useRef, useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  cancelAnimation,
  EasingFunction,
  EasingFunctionFactory,
} from 'react-native-reanimated';
import { motion } from '../styles/motion';

interface UseAnimatedModalConfig {
  entranceDelay?: number;
  entranceDuration?: number;
  exitDuration?: number;
  exitDelay?: number;
  translateDistance?: number;
  easing?: EasingFunction | EasingFunctionFactory;
}

export function useAnimatedModal(
  visible: boolean,
  config: UseAnimatedModalConfig = {},
) {
  const {
    entranceDelay = motion.modal.entranceDelay,
    entranceDuration = motion.modal.entranceDuration,
    exitDuration = motion.modal.exitDuration,
    exitDelay = 0,
    translateDistance = motion.modal.translateDistanceDefault,
    easing = motion.easing.standard,
  } = config;

  const hasTranslate = translateDistance !== 0;

  const [internalVisible, setInternalVisible] = useState(false);
  // Ref to store pending callback to execute after exit animation completes
  const exitCallbackRef = useRef<(() => void) | null>(null);

  const backgroundOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(
    hasTranslate ? translateDistance : 0,
  );

  // Called from worklet after exit animation completes
  const handleExitComplete = useCallback(() => {
    setInternalVisible(false);
    // Execute pending callback if any
    if (exitCallbackRef.current) {
      exitCallbackRef.current();
      exitCallbackRef.current = null;
    }
    // Also check for callback stored in uiStore (from closeAllModalsWithCallback)
    // Import dynamically to avoid circular dependency
    const { useUIStore } = require('../stores/uiStore');
    const storedCallback = useUIStore.getState().consumeDismissCallback();
    if (storedCallback) {
      storedCallback();
    }
  }, []);

  // Trigger dismiss with optional callback
  const dismiss = (afterCallback?: () => void) => {
    if (afterCallback) {
      exitCallbackRef.current = afterCallback;
    }
  };

  useEffect(() => {
    if (visible) {
      // Cancel any ongoing exit animations first
      cancelAnimation(backgroundOpacity);
      cancelAnimation(contentOpacity);
      cancelAnimation(contentTranslateY);

      // Reset to starting values before entrance animation
      backgroundOpacity.value = 0;
      contentOpacity.value = 0;
      if (hasTranslate) {
        contentTranslateY.value = translateDistance;
      }

      setInternalVisible(true);

      // Entrance animations - use requestAnimationFrame to ensure values are reset first
      requestAnimationFrame(() => {
        backgroundOpacity.value = withTiming(1, {
          duration: entranceDuration,
        });
        contentOpacity.value = withDelay(
          entranceDelay,
          withTiming(1, { duration: entranceDuration, easing }),
        );
        if (hasTranslate) {
          contentTranslateY.value = withDelay(
            entranceDelay,
            withTiming(0, { duration: entranceDuration, easing }),
          );
        }
      });
    } else if (internalVisible) {
      // Exit animations
      contentOpacity.value = withDelay(
        exitDelay,
        withTiming(0, { duration: exitDuration, easing }),
      );
      if (hasTranslate) {
        contentTranslateY.value = withDelay(
          exitDelay,
          withTiming(translateDistance, { duration: exitDuration, easing }),
        );
      }

      backgroundOpacity.value = withDelay(
        exitDelay + exitDuration,
        withTiming(0, { duration: exitDuration }, () => {
          runOnJS(handleExitComplete)();
        }),
      );
    }
  }, [
    visible,
    internalVisible,
    backgroundOpacity,
    contentOpacity,
    contentTranslateY,
    entranceDelay,
    entranceDuration,
    exitDuration,
    exitDelay,
    translateDistance,
    easing,
    hasTranslate,
    handleExitComplete,
  ]);

  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => {
    const base: any = { opacity: contentOpacity.value };
    if (hasTranslate) {
      base.transform = [{ translateY: contentTranslateY.value }];
    }
    return base;
  });

  return {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    contentOpacitySV: contentOpacity,
    /** Call to register a callback that fires after exit animation completes */
    dismiss,
  };
}
