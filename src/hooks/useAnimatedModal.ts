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
import { usePrefersReducedMotion } from './useReduceMotion';

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
  const prefersReducedMotion = usePrefersReducedMotion();
  const animateModal = prefersReducedMotion === false;
  const effectiveEntranceDelay = animateModal ? entranceDelay : 0;
  const effectiveEntranceDuration = animateModal ? entranceDuration : 0;
  const effectiveExitDuration = animateModal ? exitDuration : 0;
  const effectiveExitDelay = animateModal ? exitDelay : 0;
  const effectiveTranslateDistance = animateModal ? translateDistance : 0;

  const hasTranslate = effectiveTranslateDistance !== 0;

  const [internalVisible, setInternalVisible] = useState(false);
  // Ref to store pending callback to execute after exit animation completes
  const exitCallbackRef = useRef<(() => void) | null>(null);
  const entranceFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const backgroundOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(
    hasTranslate ? effectiveTranslateDistance : 0,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (entranceFrameRef.current !== null) {
        cancelAnimationFrame(entranceFrameRef.current);
      }
      cancelAnimation(backgroundOpacity);
      cancelAnimation(contentOpacity);
      cancelAnimation(contentTranslateY);
    };
  }, [backgroundOpacity, contentOpacity, contentTranslateY]);

  // Called from worklet after exit animation completes
  const handleExitComplete = useCallback(() => {
    // The parent keys this component by orientation, so a rotation mid-exit
    // unmounts us while the Reanimated completion is still pending.
    if (!mountedRef.current) return;
    setInternalVisible(false);
    // Execute pending callback if any
    if (exitCallbackRef.current) {
      exitCallbackRef.current();
      exitCallbackRef.current = null;
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
        contentTranslateY.value = effectiveTranslateDistance;
      }

      setInternalVisible(true);

      // Entrance animations - use requestAnimationFrame to ensure values are reset first
      entranceFrameRef.current = requestAnimationFrame(() => {
        entranceFrameRef.current = null;
        backgroundOpacity.value = withTiming(1, {
          duration: effectiveEntranceDuration,
        });
        contentOpacity.value = withDelay(
          effectiveEntranceDelay,
          withTiming(1, { duration: effectiveEntranceDuration, easing }),
        );
        if (hasTranslate) {
          contentTranslateY.value = withDelay(
            effectiveEntranceDelay,
            withTiming(0, { duration: effectiveEntranceDuration, easing }),
          );
        }
      });
    } else if (internalVisible) {
      // Exit animations
      contentOpacity.value = withDelay(
        effectiveExitDelay,
        withTiming(0, { duration: effectiveExitDuration, easing }),
      );
      if (hasTranslate) {
        contentTranslateY.value = withDelay(
          effectiveExitDelay,
          withTiming(effectiveTranslateDistance, {
            duration: effectiveExitDuration,
            easing,
          }),
        );
      }

      backgroundOpacity.value = withDelay(
        effectiveExitDelay + effectiveExitDuration,
        withTiming(0, { duration: effectiveExitDuration }, () => {
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
    effectiveEntranceDelay,
    effectiveEntranceDuration,
    effectiveExitDuration,
    effectiveExitDelay,
    effectiveTranslateDistance,
    easing,
    hasTranslate,
    handleExitComplete,
  ]);

  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));
  const animatedContentStyle = useAnimatedStyle(() => {
    const base: { opacity: number; transform?: { translateY: number }[] } = {
      opacity: contentOpacity.value,
    };
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
