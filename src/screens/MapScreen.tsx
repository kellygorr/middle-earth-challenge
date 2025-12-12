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
} from 'react-native-reanimated';
import SettingsModal from '../components/SettingsModal';
import SettingsIcon from '../components/SettingsIcon';
import PositionedCheckpoint from '../components/Checkpoint/PositionedCheckpoint';
import MiddleEarthMapSvg from '../components/MiddleEarthMapSvg';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import { layerColors } from '../styles/svgLayerColors';
import { typography } from '../styles/typography';
import { Checkpoint } from '../types';

const checkpointsData = checkpointsDataRaw as Checkpoint[];

const { width, height } = Dimensions.get('window');

// SVG dimensions from viewBox
const SVG_WIDTH = 3174.5;
const SVG_HEIGHT = 2373.04;

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

  // Calculate scale factors to convert SVG coordinates to rendered coordinates
  const svgScaleX = (width * 3) / SVG_WIDTH;
  const svgScaleY = height / SVG_HEIGHT;

  // The SVG is centered, so calculate the left offset
  // SVG width is (width * 3), which is centered in the container
  const svgOffsetX = (width * 3 - width) / 2; // How much the SVG extends to the left of the visible area

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
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

  // Calculate checkpoint base positions
  const centerX = width / 2;
  const centerY = height / 2;

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        { backgroundColor: theme.colors.mapBackground },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      {/* Map - Using simplified SVG */}
      <View
        style={[
          styles.mapContainer,
          { backgroundColor: theme.colors.mapBackground },
        ]}
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.svgWrapper, animatedStyle]}>
            <MiddleEarthMapSvg
              width={width * 3}
              height={height}
              preserveAspectRatio="none"
              colorize={colorizeMap}
              showTitles={showMapTitles}
              layerColors={{
                ...layerColors,
                mapBackground: theme.colors.mapBackground,
              }}
            />
          </Animated.View>
        </GestureDetector>

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
});
