import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { motion } from '../styles/motion';

const { width, height } = Dimensions.get('window');

// Constants
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const RENDER_SCALE = 3; // Matches MiddleEarthMapSkia

interface UseMapGesturesOptions {
  initialScrollX: number;
  initialScrollY: number;
}

interface UseMapGesturesReturn {
  // Shared values
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  recenterOpacity: SharedValue<number>;
  isRecentering: SharedValue<boolean>;
  originMonitorEnabled: SharedValue<boolean>;

  // Gesture
  composedGesture: ReturnType<typeof Gesture.Simultaneous>;

  // Animated style for the map wrapper
  animatedStyle: ReturnType<typeof useAnimatedStyle>;

  // Recenter button style
  recenterButtonStyle: ReturnType<typeof useAnimatedStyle>;

  // Actions
  handleRecenter: () => void;
  resetToOrigin: () => void;
}

export function useMapGestures({
  initialScrollX,
  initialScrollY,
}: UseMapGesturesOptions): UseMapGesturesReturn {
  // Transform shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialScrollX);
  const translateY = useSharedValue(initialScrollY);
  const savedTranslateX = useSharedValue(initialScrollX);
  const savedTranslateY = useSharedValue(initialScrollY);

  // Screen dimensions for boundary calculations
  const screenWidth = useSharedValue(width);
  const screenHeight = useSharedValue(height);

  // Recenter button state
  const recenterOpacity = useSharedValue(0);
  const isRecentering = useSharedValue(false);
  const originMonitorEnabled = useSharedValue(true);

  // Recenter button animated style
  const recenterButtonStyle = useAnimatedStyle(() => ({
    opacity: recenterOpacity.value,
    backgroundColor: '#000000',
  }));

  // Pinch gesture for zooming
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const newScale = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

      // Calculate boundaries based on scaled content
      const scaledMapWidth = screenWidth.value * 3 * scale.value;
      const scaledMapHeight = screenHeight.value * scale.value;
      const excessWidth = Math.max(0, (scaledMapWidth - screenWidth.value) / 2);
      const excessHeight = Math.max(
        0,
        (scaledMapHeight - screenHeight.value) / 2,
      );

      const maxX = excessWidth + 50;
      const minX = -excessWidth - 50;
      const maxY = excessHeight + 50;
      const minY = -excessHeight - 50;

      translateX.value = Math.min(Math.max(translateX.value, minX), maxX);
      translateY.value = Math.min(Math.max(translateY.value, minY), maxY);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Pan gesture for dragging
  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      const newX = savedTranslateX.value + e.translationX;
      const newY = savedTranslateY.value + e.translationY;

      // Calculate boundaries based on scaled content
      const scaledMapWidth = screenWidth.value * 3 * scale.value;
      const scaledMapHeight = screenHeight.value * scale.value;
      const excessWidth = Math.max(0, (scaledMapWidth - screenWidth.value) / 2);
      const excessHeight = Math.max(
        0,
        (scaledMapHeight - screenHeight.value) / 2,
      );
      const padding = 80;
      const maxX = excessWidth + padding;
      const minX = -excessWidth - padding;
      const maxY = excessHeight + padding;
      const minY = -excessHeight - padding;
      translateX.value = Math.min(Math.max(newX, minX), maxX);
      translateY.value = Math.min(Math.max(newY, minY), maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Combined gesture
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Map wrapper animated style
  const animatedStyle = useAnimatedStyle(() => {
    // Compensate for the 3x pre-rendered canvas
    // At zoom=1, we want to display at 1/3 size (effectiveScale = 1/3)
    // At zoom=3, we want 1:1 pixels (effectiveScale = 1)
    const effectiveScale = scale.value / RENDER_SCALE;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: effectiveScale },
      ],
    };
  });

  // Origin watcher: show recenter button when user moves away from origin
  useDerivedValue(() => {
    if (!originMonitorEnabled.value) return;
    const movedScale = scale.value !== 1;
    const movedX = translateX.value !== initialScrollX;
    const movedY = translateY.value !== initialScrollY;
    if (movedScale || movedX || movedY) {
      recenterOpacity.value = withTiming(1, {
        duration: motion.button.enterDuration,
      });
      originMonitorEnabled.value = false;
    }
  });

  // Recenter handler
  const handleRecenter = () => {
    isRecentering.value = true;
    // Immediate feedback: hide button right away
    recenterOpacity.value = withTiming(0, {
      duration: motion.button.exitDuration,
    });
    scale.value = withTiming(
      1,
      { duration: motion.recenter.duration, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedScale.value = 1;
        }
      },
    );
    translateX.value = withTiming(
      initialScrollX,
      { duration: motion.recenter.duration, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedTranslateX.value = initialScrollX;
        }
      },
    );
    translateY.value = withTiming(
      initialScrollY,
      { duration: motion.recenter.duration, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedTranslateY.value = initialScrollY;
          isRecentering.value = false;
          // Re-enable monitoring after recenter completes
          originMonitorEnabled.value = true;
        }
      },
    );
  };

  // Reset to origin (used when welcome modal shows)
  const resetToOrigin = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = initialScrollX;
    translateY.value = initialScrollY;
    savedTranslateX.value = initialScrollX;
    savedTranslateY.value = initialScrollY;
    originMonitorEnabled.value = true;
  };

  return {
    scale,
    translateX,
    translateY,
    recenterOpacity,
    isRecentering,
    originMonitorEnabled,
    composedGesture,
    animatedStyle,
    recenterButtonStyle,
    handleRecenter,
    resetToOrigin,
  };
}
