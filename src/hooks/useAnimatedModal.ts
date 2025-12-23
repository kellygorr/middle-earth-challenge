import { useEffect, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
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

  const backgroundOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(
    hasTranslate ? translateDistance : 0,
  );

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);

      // Entrance animations
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
      } else {
        contentTranslateY.value = 0;
      }
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
          runOnJS(setInternalVisible)(false);
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
  };
}
