import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Text,
  TextInput,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useDerivedValue,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import SettingsModal from '../components/SettingsModal';
import SettingsIcon from '../components/Icons/SettingsIcon';
import RecenterIcon from '../components/Icons/RecenterIcon';
import { iconSizes } from '../styles/global';
import PositionedCheckpoint from '../components/Checkpoint/PositionedCheckpoint';
import MiddleEarthMapSkia from '../components/MiddleEarthMapSkia';

import { useTheme, useSettingsStore } from '../stores/settingsStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import { TOTAL_JOURNEY_MILES } from '../constants/journey';
import { layerColors } from '../styles/svgLayerColors';
import { typography } from '../styles/typography';
import { Checkpoint } from '../types';
import { FRODO_PATH } from '../data/mapData';

const checkpointsData = checkpointsDataRaw as Checkpoint[];

const { width, height } = Dimensions.get('window');

// SVG dimensions from viewBox (from middle-earth-map-full.svg)
const SVG_WIDTH = 3059.47;
const SVG_HEIGHT = 2350.67;

export default function MapScreen() {
  const theme = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [testMiles, setTestMiles] = useState('0');
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const showCheckpointLabels = useSettingsStore(
    state => state.showCheckpointLabels,
  );
  const setShowCheckpointLabels = useSettingsStore(
    state => state.setShowCheckpointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const showMapTitles = useSettingsStore(state => state.showMapTitles);

  // Calculate scale factors to convert SVG coordinates to rendered coordinates
  const svgScaleX = (width * 3) / SVG_WIDTH;
  const svgScaleY = height / SVG_HEIGHT;

  // The SVG is centered, so calculate the left offset
  // SVG width is (width * 3), which is centered in the container
  const svgOffsetX = (width * 3 - width) / 2;

  // Calculate initial position for first checkpoint (Hobbiton)
  const firstCheckpoint = checkpointsData[0];
  const firstCheckpointX = firstCheckpoint.x * svgScaleX - svgOffsetX;
  const firstCheckpointY = firstCheckpoint.y * svgScaleY;
  const centerX = width / 2;
  const centerY = height / 2;

  // Position the first checkpoint near the left side to show the journey path ahead
  const targetX = 50; // 50px from left edge
  const targetY = 300; // 300px from top
  const initialScrollX = targetX - firstCheckpointX;
  const initialScrollY = targetY - firstCheckpointY;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialScrollX);
  const translateY = useSharedValue(initialScrollY);
  const savedTranslateX = useSharedValue(initialScrollX);
  const savedTranslateY = useSharedValue(initialScrollY);
  // Suppress recenter button flicker while recentering animation runs
  const isRecentering = useSharedValue(false);

  // Recenter button opacity (starts hidden at origin; shown when monitor detects leaving)
  const recenterOpacity = useSharedValue(0);
  const recenterButtonStyle = useAnimatedStyle(() => ({
    opacity: recenterOpacity.value,
    backgroundColor: '#000000',
  }));

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  const screenWidth = useSharedValue(width);
  const screenHeight = useSharedValue(height);

  // Shared animation timings
  const BUTTON_ENTER_DURATION = 220;
  const BUTTON_EXIT_DURATION = 50;
  const BUTTON_ENTER_DELAY_LABELS = 120;
  // Opacity animations use linear timing (no easing)

  // Origin monitoring: start enabled on load, disable once we leave origin,
  // and re-enable after recenter completes.
  const originMonitorEnabled = useSharedValue(true);

  // Initial path reveal animation (0 to 1)
  const initialPathProgress = useSharedValue(showWelcome ? 0 : 1);
  // UI button opacities (all stay mounted; fade via opacity)
  const settingsOpacity = useSharedValue(showWelcome ? 0 : 1);
  const labelsOpacity = useSharedValue(showWelcome ? 0 : 1);
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
        duration: BUTTON_ENTER_DURATION,
      });
      labelsOpacity.value = withDelay(
        BUTTON_ENTER_DELAY_LABELS,
        withTiming(1, {
          duration: BUTTON_ENTER_DURATION,
        }),
      );

      // Then start path animation
      initialPathProgress.value = withDelay(
        1000,
        withTiming(1, { duration: 2000 }),
      );
    } else {
      // Reset opacities when welcome shows
      cancelAnimation(settingsOpacity);
      cancelAnimation(labelsOpacity);
      settingsOpacity.value = withTiming(0, {
        duration: BUTTON_EXIT_DURATION,
      });
      labelsOpacity.value = withTiming(0, {
        duration: BUTTON_EXIT_DURATION,
      });
      // Hide recenter button and reset origin monitoring
      cancelAnimation(recenterOpacity);
      recenterOpacity.value = withTiming(0, { duration: BUTTON_EXIT_DURATION });
      originMonitorEnabled.value = true;
      // Force map back to original position so recenter stays hidden
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = initialScrollX;
      translateY.value = initialScrollY;
      savedTranslateX.value = initialScrollX;
      savedTranslateY.value = initialScrollY;
      // Hide path so it can re-run on next dismissal
      initialPathProgress.value = 0;
    }
  }, [
    showWelcome,
    initialPathProgress,
    settingsOpacity,
    labelsOpacity,
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    initialScrollX,
    initialScrollY,
    originMonitorEnabled,
    recenterOpacity,
  ]);

  // Convert journey miles to 0-1 progress for path animation
  const journeyProgressValue = useSharedValue(
    testMiles ? Math.min(parseFloat(testMiles) / TOTAL_JOURNEY_MILES, 1) : 0,
  );

  // Update progress when test miles changes
  useEffect(() => {
    const miles = parseFloat(testMiles) || 0;
    journeyProgressValue.value = Math.min(miles / TOTAL_JOURNEY_MILES, 1);
  }, [testMiles, journeyProgressValue]);

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

  // RENDER_SCALE matches the scale used in MiddleEarthMapSkia
  const RENDER_SCALE = 3;

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

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Centralized origin watcher: compares current values to initial origin.
  // When values differ, show the recenter button and stop watching.
  useDerivedValue(() => {
    if (!originMonitorEnabled.value) return;
    // Exact comparison after explicit snap-to-origin
    const movedScale = scale.value !== 1;
    const movedX = translateX.value !== initialScrollX;
    const movedY = translateY.value !== initialScrollY;
    if (movedScale || movedX || movedY) {
      recenterOpacity.value = withTiming(1, {
        duration: BUTTON_ENTER_DURATION,
      });
      originMonitorEnabled.value = false;
    }
  });

  const handleRecenter = () => {
    isRecentering.value = true;
    // Immediate feedback: hide button right away
    recenterOpacity.value = withTiming(0, { duration: BUTTON_EXIT_DURATION });
    scale.value = withTiming(
      1,
      { duration: 280, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedScale.value = 1;
        }
      },
    );
    translateX.value = withTiming(
      initialScrollX,
      { duration: 280, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedTranslateX.value = initialScrollX;
        }
      },
    );
    translateY.value = withTiming(
      initialScrollY,
      { duration: 280, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          savedTranslateY.value = initialScrollY;
          isRecentering.value = false;
          // Re-enable monitoring after recenter completes to confirm origin.
          originMonitorEnabled.value = true;
        }
      },
    );
  };

  // Use the actual Frodo path from the SVG
  const gamePath = FRODO_PATH;

  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        { backgroundColor: theme.colors.mapBackground },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      {/* Map - Using simplified SVG */}
      <GestureDetector gesture={composedGesture}>
        <View
          style={[
            styles.mapContainer,
            { backgroundColor: theme.colors.mapBackground },
          ]}
        >
          <Animated.View style={[styles.svgWrapper, animatedStyle]}>
            <MiddleEarthMapSkia
              width={width * 3}
              height={height}
              colorize={colorizeMap}
              showTitles={showMapTitles}
              gamePathColor={theme.colors.checkpointUnlocked}
              gamePathInactiveColor={theme.colors.pathGrey}
              gamePathData={gamePath}
              zoomScale={scale}
              journeyProgress={journeyProgressValue}
              initialPathProgress={initialPathProgress}
              layerColors={{
                ...layerColors,
                mapBackground: theme.colors.mapBackground,
              }}
            />
          </Animated.View>

          {/* Checkpoints - rendered outside the animated view so they don't scale */}
          {checkpointsData.map(checkpoint => {
            const baseX = checkpoint.x * svgScaleX - svgOffsetX;
            const baseY = checkpoint.y * svgScaleY;

            return (
              <PositionedCheckpoint
                key={checkpoint.id}
                checkpoint={checkpoint}
                baseX={baseX}
                baseY={baseY}
                centerX={centerX}
                centerY={centerY}
                translateX={translateX}
                translateY={translateY}
                scale={scale}
                showLabel={showCheckpointLabels}
                onPress={() =>
                  console.log(`${checkpoint.name} checkpoint pressed`)
                }
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* Settings Button (always mounted; opacity-driven) */}
      <Animated.View style={[styles.settingsButton, settingsEnterStyle]}>
        <TouchableOpacity
          style={styles.recenterButtonTouch}
          onPress={() => setShowSettings(true)}
          activeOpacity={0.7}
        >
          <SettingsIcon size={iconSizes.medium} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Labels Toggle (always mounted; opacity-driven with stagger) */}
      <Animated.View style={[styles.labelsButton, labelsEnterStyle]}>
        <TouchableOpacity
          onPress={() => setShowCheckpointLabels(!showCheckpointLabels)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.labelContainer,
              {
                backgroundColor: showCheckpointLabels
                  ? theme.colors.checkpointTextBackground
                  : theme.colors.checkpointLabelInactive,
              },
            ]}
          >
            <Text
              style={[
                typography.label,
                { color: theme.colors.checkpointLabel },
              ]}
            >
              Labels
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Recenter Button (always mounted; opacity-driven based on center state) */}
      <Animated.View style={[styles.recenterButton, recenterButtonStyle]}>
        <TouchableOpacity
          style={styles.recenterButtonTouch}
          onPress={handleRecenter}
          activeOpacity={0.7}
        >
          <RecenterIcon size={iconSizes.medium} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onDismiss={() => setShowSettings(false)}
      />

      {/* Test Input for Progress (conditional render) */}
      {!showWelcome && (
        <View style={styles.testInputContainer}>
          <Text style={styles.testInputLabel}>Test Miles:</Text>
          <TextInput
            style={styles.testInput}
            value={testMiles}
            onChangeText={setTestMiles}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#999"
          />
          <Text style={styles.testInputLabel}>/ {TOTAL_JOURNEY_MILES}</Text>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  svgWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelsButton: {
    position: 'absolute',
    top: 120, // Below settings button with more spacing
    right: 20,
  },
  labelContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recenterButton: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterButtonTouch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testInputContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  testInputLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    marginHorizontal: 8,
  },
  testInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 80,
    fontSize: 16,
    textAlign: 'center',
    color: '#000000',
  },
});
