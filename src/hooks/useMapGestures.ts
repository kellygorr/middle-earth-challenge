import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  withTiming,
  SharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { motion } from '../styles/motion';

// Constants
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

interface UseMapGesturesOptions {
  initialScrollX: number;
  initialScrollY: number;
  mapWidth: number;
  mapHeight: number;
  screenWidth: number;
  screenHeight: number;
  onMapInteraction?: () => void;
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
  mapWidth,
  mapHeight,
  screenWidth: screenW,
  screenHeight: screenH,
  onMapInteraction,
}: UseMapGesturesOptions): UseMapGesturesReturn {
  // Transform shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialScrollX);
  const translateY = useSharedValue(initialScrollY);
  const savedTranslateX = useSharedValue(initialScrollX);
  const savedTranslateY = useSharedValue(initialScrollY);

  // Dimensions for boundary calculations (reactive)
  const mapW = useSharedValue(mapWidth);
  const mapH = useSharedValue(mapHeight);
  const screenWidth = useSharedValue(screenW);
  const screenHeight = useSharedValue(screenH);

  // Update shared values when dimensions change (orientation)
  // Preserve zoom and position - just update dimension values for boundary calculations
  useEffect(() => {
    mapW.value = mapWidth;
    mapH.value = mapHeight;
    screenWidth.value = screenW;
    screenHeight.value = screenH;

    // Clamp current position to new boundaries
    const displayedMapWidth = mapWidth * scale.value;
    const displayedMapHeight = mapHeight * scale.value;
    const excessWidth = Math.max(0, (displayedMapWidth - screenW) / 2);
    const excessHeight = Math.max(0, (displayedMapHeight - screenH) / 2);
    const padding = 80;
    const maxX = excessWidth + padding;
    const minX = -excessWidth - padding;
    const maxY = excessHeight + padding;
    const minY = -excessHeight - padding;

    // Adjust position if out of bounds
    translateX.value = Math.min(Math.max(translateX.value, minX), maxX);
    translateY.value = Math.min(Math.max(translateY.value, minY), maxY);
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  }, [
    mapWidth,
    mapHeight,
    screenW,
    screenH,
    mapW,
    mapH,
    screenWidth,
    screenHeight,
    scale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
  ]);

  // Recenter button state
  const recenterOpacity = useSharedValue(0);
  const isRecentering = useSharedValue(false);
  const originMonitorEnabled = useSharedValue(true);

  // Recenter button animated style
  const recenterButtonStyle = useAnimatedStyle(() => ({
    opacity: recenterOpacity.value,
  }));

  // Pinch gesture for zooming
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const newScale = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

      // Calculate boundaries: how much the scaled map exceeds the screen
      const displayedMapWidth = mapW.value * scale.value;
      const displayedMapHeight = mapH.value * scale.value;
      const excessWidth = Math.max(
        0,
        (displayedMapWidth - screenWidth.value) / 2,
      );
      const excessHeight = Math.max(
        0,
        (displayedMapHeight - screenHeight.value) / 2,
      );

      const padding = 50;
      const maxX = excessWidth + padding;
      const minX = -excessWidth - padding;
      const maxY = excessHeight + padding;
      const minY = -excessHeight - padding;

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
    .onStart(() => {
      if (onMapInteraction) {
        runOnJS(onMapInteraction)();
      }
    })
    .onUpdate(e => {
      const newX = savedTranslateX.value + e.translationX;
      const newY = savedTranslateY.value + e.translationY;

      // Calculate boundaries: how much the scaled map exceeds the screen
      const displayedMapWidth = mapW.value * scale.value;
      const displayedMapHeight = mapH.value * scale.value;
      const excessWidth = Math.max(
        0,
        (displayedMapWidth - screenWidth.value) / 2,
      );
      const excessHeight = Math.max(
        0,
        (displayedMapHeight - screenHeight.value) / 2,
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

  // Map wrapper animated style - simple transform, no RENDER_SCALE division
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
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
      { duration: motion.recenter.duration, easing: motion.easing.standard },
      finished => {
        if (finished) {
          savedScale.value = 1;
        }
      },
    );
    translateX.value = withTiming(
      initialScrollX,
      { duration: motion.recenter.duration, easing: motion.easing.standard },
      finished => {
        if (finished) {
          savedTranslateX.value = initialScrollX;
        }
      },
    );
    translateY.value = withTiming(
      initialScrollY,
      { duration: motion.recenter.duration, easing: motion.easing.standard },
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
