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
} from 'react-native-gesture-handler';
import Animated, { useSharedValue } from 'react-native-reanimated';
import SettingsModal from '../components/SettingsModal';
import SettingsIcon from '../components/Icons/SettingsIcon';
import RecenterIcon from '../components/Icons/RecenterIcon';
import { iconSizes } from '../styles/global';
import PositionedCheckpoint from '../components/Checkpoint/PositionedCheckpoint';
import MiddleEarthMapSkia from '../components/MiddleEarthMapSkia';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import { TOTAL_JOURNEY_MILES } from '../constants/journey';
import { typography } from '../styles/typography';
import { Checkpoint } from '../types';
import { GAME_PATH } from '../data/mapPathData';
import { useMapGestures } from '../hooks/useMapGestures';
import { useInitialAnimation } from '../hooks/useInitialAnimation';

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
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);

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

  // Map gestures (pinch/pan, recenter)
  const {
    scale,
    translateX,
    translateY,
    recenterOpacity,
    originMonitorEnabled,
    composedGesture,
    animatedStyle,
    recenterButtonStyle,
    handleRecenter,
    resetToOrigin,
  } = useMapGestures({ initialScrollX, initialScrollY });

  // Initial animation (path reveal, button opacities)
  const { initialPathProgress, settingsEnterStyle, labelsEnterStyle } =
    useInitialAnimation({
      showWelcome,
      recenterOpacity,
      originMonitorEnabled,
      resetToOrigin,
    });

  // Convert journey miles to 0-1 progress for path animation
  const journeyProgressValue = useSharedValue(
    testMiles ? Math.min(parseFloat(testMiles) / TOTAL_JOURNEY_MILES, 1) : 0,
  );

  // Update progress when test miles changes
  useEffect(() => {
    const miles = parseFloat(testMiles) || 0;
    journeyProgressValue.value = Math.min(miles / TOTAL_JOURNEY_MILES, 1);
  }, [testMiles, journeyProgressValue]);

  // Use the journey path from the SVG
  const gamePath = GAME_PATH;

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
              reducedTitles={reducedMapTitles}
              defaultColor={theme.colors.mapDefaultColor}
              gamePathColor={theme.colors.checkpointUnlocked}
              gamePathInactiveColor={theme.colors.pathGrey}
              gamePathData={gamePath}
              zoomScale={scale}
              journeyProgress={journeyProgressValue}
              initialPathProgress={initialPathProgress}
              layerColors={{
                legend: theme.colors.svgLegend,
                titles: theme.colors.svgTitles,
                titlesReduced: theme.colors.svgTitlesReduced,
                trees: theme.colors.svgTrees,
                mountains: theme.colors.svgMountains,
                streets: theme.colors.svgStreets,
                water: theme.colors.svgWater,
                coastline: theme.colors.svgCoastline,
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
                onPress={() => {
                  // TODO: Handle checkpoint press
                }}
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
          <SettingsIcon
            size={iconSizes.medium}
            color={theme.colors.mapBackground}
          />
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
          <RecenterIcon
            size={iconSizes.medium}
            color={theme.colors.mapBackground}
          />
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
