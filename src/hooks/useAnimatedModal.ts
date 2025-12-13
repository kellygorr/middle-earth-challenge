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
    entranceDelay = 200,
    entranceDuration = 300,
    exitDuration = 300,
    exitDelay = 0,
    translateDistance = -24,
    easing = Easing.out(Easing.cubic),
  } = config;

  // Internal state to keep modal mounted during exit animation
  const [internalVisible, setInternalVisible] = useState(false);

  // Animation values
  const backgroundOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(translateDistance);

  // Calculate total exit animation time (if needed for future use)
  // const totalExitDuration = exitDuration + exitDelay;

  useEffect(() => {
    if (visible) {
      // Show modal immediately
      setInternalVisible(true);

      // Entrance: background fades in, then content slides down
      backgroundOpacity.value = withTiming(1, { duration: entranceDelay });
      contentOpacity.value = withDelay(
        entranceDelay,
        withTiming(1, {
          duration: entranceDuration,
          easing,
        }),
      );
      contentTranslateY.value = withDelay(
        entranceDelay,
        withTiming(0, {
          duration: entranceDuration,
          easing,
        }),
      );
    } else if (internalVisible) {
      // Exit: content slides up, then background fades out
      contentOpacity.value = withDelay(
        exitDelay,
        withTiming(0, {
          duration: exitDuration,
          easing,
        }),
      );
      contentTranslateY.value = withDelay(
        exitDelay,
        withTiming(translateDistance, {
          duration: exitDuration,
          easing,
        }),
      );
      backgroundOpacity.value = withDelay(
        exitDuration + exitDelay + 50,
        withTiming(
          0,
          {
            duration: entranceDelay, // Use same duration as entrance for symmetry
          },
          () => {
            // Hide modal after animation completes
            runOnJS(setInternalVisible)(false);
          },
        ),
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
  ]);

  // Animated styles
  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  return {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
  };
}
