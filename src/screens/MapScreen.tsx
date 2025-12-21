import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
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
import { useReactiveDimensions } from '../hooks/useReactiveDimensions';

const checkpointsData = checkpointsDataRaw as Checkpoint[];

// SVG dimensions from viewBox (from middle-earth-map-full.svg)
const SVG_WIDTH = 3059.47;
const SVG_HEIGHT = 2350.67;

export default function MapScreen() {
  const theme = useTheme();
  const { width, height } = useReactiveDimensions(); // reactive
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

  // UNIFORM SCALING: Use consistent zoom feel across orientations
  // Base minimum width on the shorter screen dimension for consistent scale
  const minDimension = Math.min(width, height);
  const minWidthScale = (minDimension * 3) / SVG_WIDTH;
  const heightScale = height / SVG_HEIGHT;
  const uniformScale = Math.max(minWidthScale, heightScale);

  // Map dimensions with uniform scaling (no squishing)
  const mapWidth = SVG_WIDTH * uniformScale;
  const mapHeight = SVG_HEIGHT * uniformScale;

  // Centering offsets (map may extend beyond screen in both directions)
  const mapOffsetX = (mapWidth - width) / 2;
  const mapOffsetY = (mapHeight - height) / 2;

  const firstCheckpoint = checkpointsData[0];
  const firstCheckpointX = firstCheckpoint.x * uniformScale - mapOffsetX;
  const firstCheckpointY = firstCheckpoint.y * uniformScale - mapOffsetY;

  const targetX = 50;
  const targetY = 300;
  const initialScrollX = targetX - firstCheckpointX;
  const initialScrollY = targetY - firstCheckpointY;

  // Map gestures
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
  } = useMapGestures({
    initialScrollX,
    initialScrollY,
    mapWidth, // uniformly scaled width
    mapHeight, // uniformly scaled height (may exceed screen in landscape)
    screenWidth: width,
    screenHeight: height,
  });

  // Initial animation
  const { initialPathProgress, settingsEnterStyle, labelsEnterStyle } =
    useInitialAnimation({
      showWelcome,
      recenterOpacity,
      originMonitorEnabled,
      resetToOrigin,
    });

  // Journey progress
  const journeyProgressValue = useSharedValue(
    testMiles ? Math.min(parseFloat(testMiles) / TOTAL_JOURNEY_MILES, 1) : 0,
  );

  useEffect(() => {
    const miles = parseFloat(testMiles) || 0;
    journeyProgressValue.value = Math.min(miles / TOTAL_JOURNEY_MILES, 1);
  }, [testMiles, journeyProgressValue]);

  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        { backgroundColor: theme.colors.mapBackground },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      <GestureDetector gesture={composedGesture}>
        <View
          style={[
            styles.mapContainer,
            { backgroundColor: theme.colors.mapBackground },
          ]}
        >
          <Animated.View style={[styles.svgWrapper, animatedStyle]}>
            <MiddleEarthMapSkia
              width={mapWidth}
              height={mapHeight}
              colorize={colorizeMap}
              reducedTitles={reducedMapTitles}
              defaultColor={theme.colors.mapDefaultColor}
              gamePathColor={theme.colors.checkpointUnlocked}
              gamePathInactiveColor={theme.colors.pathGrey}
              gamePathData={GAME_PATH}
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

          {/* Checkpoints outside zoom */}
          {checkpointsData.map(cp => {
            const baseX = cp.x * uniformScale - mapOffsetX;
            const baseY = cp.y * uniformScale - mapOffsetY;
            return (
              <PositionedCheckpoint
                key={cp.id}
                checkpoint={cp}
                baseX={baseX}
                baseY={baseY}
                centerX={width / 2}
                centerY={height / 2}
                translateX={translateX}
                translateY={translateY}
                scale={scale} // now used to keep checkpoints fixed while zooming
                showLabel={showCheckpointLabels}
                onPress={() => {}}
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* Settings Button */}
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

      {/* Labels Toggle */}
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

      {/* Recenter Button */}
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

      {/* Test Input */}
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

export const styles = StyleSheet.create({
  container: { flex: 1 },
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
    top: 120,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  testInputLabel: { color: '#fff', fontSize: 14, marginHorizontal: 8 },
  testInput: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 80,
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
  },
});
