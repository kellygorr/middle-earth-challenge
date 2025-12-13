import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Text,
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
} from 'react-native-reanimated';
import SettingsModal from '../components/SettingsModal';
import SettingsIcon from '../components/SettingsIcon';
import RecenterIcon from '../components/RecenterIcon';
import PositionedCheckpoint from '../components/Checkpoint/PositionedCheckpoint';
import MiddleEarthMapSvg from '../components/MiddleEarthMapSvg';

import { useTheme, useSettingsStore } from '../stores/settingsStore';
// import { useSaveStore } from '../stores/saveStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
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
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const showCheckpointLabels = useSettingsStore(
    state => state.showCheckpointLabels,
  );
  const setShowCheckpointLabels = useSettingsStore(
    state => state.setShowCheckpointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const showMapTitles = useSettingsStore(state => state.showMapTitles);
  // const journeyProgress = useSaveStore(state => state.journeyProgress);

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

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 1.5;

  const screenWidth = useSharedValue(width);
  const screenHeight = useSharedValue(height);

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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const isAtOriginalPosition = useDerivedValue(() => {
    const scaleMatch = Math.abs(scale.value - 1) < 0.01;
    const xMatch = Math.abs(translateX.value - initialScrollX) < 5;
    const yMatch = Math.abs(translateY.value - initialScrollY) < 5;
    return scaleMatch && xMatch && yMatch;
  });

  const recenterButtonStyle = useAnimatedStyle(() => ({
    backgroundColor: isAtOriginalPosition.value ? '#666666' : '#000000',
  }));

  const handleRecenter = () => {
    scale.value = withTiming(1, { duration: 300 });
    savedScale.value = 1;
    translateX.value = withTiming(initialScrollX, { duration: 300 });
    translateY.value = withTiming(initialScrollY, { duration: 300 });
    savedTranslateX.value = initialScrollX;
    savedTranslateY.value = initialScrollY;
  };

  // Use the actual Frodo path from the SVG
  const gamePath = FRODO_PATH;

  // TODO: Generate progress path based on current journey progress
  // For now, no progress path until we implement path segmentation by distance
  const progressPath = null;

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
            <MiddleEarthMapSvg
              width={width * 3}
              height={height}
              preserveAspectRatio="none"
              colorize={colorizeMap}
              showTitles={showMapTitles}
              gamePathColor="red"
              gamePathData={gamePath}
              gamePathProgressData={progressPath || undefined}
              gamePathProgressColor={theme.colors.checkpointUnlocked}
              zoomScale={scale}
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

      {/* Settings Button */}
      {!showWelcome && (
        <>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.7}
          >
            <SettingsIcon size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Labels Toggle */}
          <TouchableOpacity
            style={styles.labelsButton}
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
                  {
                    color: theme.colors.checkpointLabel,
                  },
                ]}
              >
                Labels
              </Text>
            </View>
          </TouchableOpacity>

          {/* Recenter Button */}
          <Animated.View style={[styles.recenterButton, recenterButtonStyle]}>
            <TouchableOpacity
              style={styles.recenterButtonTouch}
              onPress={handleRecenter}
              activeOpacity={0.7}
            >
              <RecenterIcon size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onDismiss={() => setShowSettings(false)}
      />
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
});
