import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Text,
  TextInput,
  Keyboard,
  Platform,
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
import InfoButton from '../components/InfoButton';
import InfoModal from '../components/InfoModal';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useInfoStore } from '../stores/infoStore';
import { useProgressStore } from '../stores/progressStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import triviaDataRaw from '../constants/trivia.json';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { typography } from '../styles/typography';
import { CheckpointType } from '../types';
import { GAME_PATH } from '../constants/mapPathData';
import { useMapGestures } from '../hooks/useMapGestures';
import { useInitialAnimation } from '../hooks/useInitialAnimation';
import { useReactiveDimensions } from '../hooks/useReactiveDimensions';

const checkpointsData = checkpointsDataRaw as CheckpointType[];
const triviaData = triviaDataRaw as CheckpointType[];

// SVG dimensions from viewBox (from middle-earth-map-full.svg)
const SVG_WIDTH = 3059.47;
const SVG_HEIGHT = 2350.67;

export default function MapScreen() {
  const theme = useTheme();
  const { width, height } = useReactiveDimensions(); // reactive
  const [showSettings, setShowSettings] = useState(false);
  const [testMiles, setTestMiles] = useState('0');
  const [keyboardOffset, setKeyboardOffset] = useState(20);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const showCheckpointLabels = useSettingsStore(
    state => state.showCheckpointLabels,
  );
  const setShowCheckpointLabels = useSettingsStore(
    state => state.setShowCheckpointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);

  // Info store for checkpoint/trivia info
  const {
    currentItem,
    itemType,
    isModalVisible,
    closeModal,
    showInfo,
    openModal,
  } = useInfoStore();

  // Miles from progress store (source of truth)
  const miles = useProgressStore(state => state.miles);
  const setMiles = useProgressStore(state => state.setMiles);

  const [currentCheckpointIndex, setCurrentCheckpointIndex] = useState<
    number | null
  >(null);

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
  const {
    initialPathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  } = useInitialAnimation({
    showWelcome,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    onInfoAnimationComplete: () => {
      // Auto-open only on first map open after welcome dismissal
      const hasAutoOpenedRef = autoOpenRef.current;
      if (!hasAutoOpenedRef && currentItem) {
        setShowInfoButtonOnce(true);
        openModal();
        autoOpenRef.current = true;
        setObserveMilesChanges(true);
      }
    },
  });

  // Gate auto-open to first map open only
  const autoOpenRef = useRef(false);
  // Show Info button only once when map opens; hide on progress changes
  const [showInfoButtonOnce, setShowInfoButtonOnce] = useState(false);
  // Track previous miles, seeded with current store value to avoid first-render hide
  const prevMilesRef = useRef<number>(miles || 0);
  // Begin observing miles changes only after info animation completes
  const [observeMilesChanges, setObserveMilesChanges] = useState(false);

  // Journey progress
  const journeyProgressValue = useSharedValue(
    miles ? mapBookMilesToPathProgress(miles) : 0,
  );

  useEffect(() => {
    journeyProgressValue.value = mapBookMilesToPathProgress(miles || 0);
    // Hide Info button when miles value changes after map open
    if (
      observeMilesChanges &&
      showInfoButtonOnce &&
      prevMilesRef.current !== miles
    ) {
      setShowInfoButtonOnce(false);
    }
    prevMilesRef.current = miles;
  }, [miles, journeyProgressValue, showInfoButtonOnce, observeMilesChanges]);

  // Determine current active checkpoint and trivia
  useEffect(() => {
    const currentMiles = miles || 0;

    // Find the current active checkpoint (last checkpoint the user has reached/passed)
    let currentCheckpoint: CheckpointType | null = null;
    let checkpointIndex: number | null = null;
    for (let i = checkpointsData.length - 1; i >= 0; i--) {
      const checkpoint = checkpointsData[i];
      if (currentMiles >= checkpoint.CUMULATIVE_MILES) {
        currentCheckpoint = checkpoint;
        checkpointIndex = i;
        break;
      }
    }

    // If no checkpoint reached yet, show Hobbiton (the start)
    if (!currentCheckpoint && currentMiles === 0) {
      currentCheckpoint = checkpointsData.find(cp => cp.isStart) || null;
      checkpointIndex = checkpointsData.findIndex(cp => cp.isStart);
    }

    // Update checkpoint index state
    setCurrentCheckpointIndex(checkpointIndex);

    // Find any trivia at current location (within a small range), but only once active
    let currentTrivia: CheckpointType | null = null;
    for (const trivia of triviaData) {
      const activationMiles = trivia.CUMULATIVE_MILES;
      // Only consider trivia once the user has reached/passed its activation mile
      if (
        currentMiles >= activationMiles &&
        Math.abs(currentMiles - activationMiles) <= 5 // 5 mile tolerance
      ) {
        currentTrivia = trivia;
        break;
      }
    }

    // Prioritize trivia over checkpoints when both are available
    if (currentTrivia) {
      if (currentItem?.name !== currentTrivia.name || itemType !== 'trivia') {
        showInfo(currentTrivia, 'trivia');
      }
    } else if (currentCheckpoint) {
      if (
        currentItem?.name !== currentCheckpoint.name ||
        itemType !== 'checkpoint'
      ) {
        showInfo(currentCheckpoint, 'checkpoint');
      }
    }
  }, [miles, currentItem, itemType, showInfo]);

  // Reset Info button gating when welcome is shown again
  useEffect(() => {
    if (showWelcome) {
      setShowInfoButtonOnce(false);
      autoOpenRef.current = false;
      setObserveMilesChanges(false);
    }
  }, [showWelcome]);

  // Lift the Test Miles overlay above the keyboard when it opens
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const kbHeight = e?.endCoordinates?.height ?? 0;
        setKeyboardOffset(kbHeight + 20);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOffset(20),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

          {/* Checkpoints and Trivia */}
          {[...triviaData, ...checkpointsData].map(item => {
            const baseX = item.x * uniformScale - mapOffsetX;
            const baseY = item.y * uniformScale - mapOffsetY;
            const bookMiles = miles || 0;

            // Determine type and activation logic
            const isCheckpoint = 'checkpointActivationMiles' in item;
            const type = isCheckpoint ? 'checkpoint' : 'trivia';

            let isActive: boolean;
            if (isCheckpoint) {
              // Use book miles (CUMULATIVE_MILES) for actual activation; keep checkpointActivationMiles for any visual-only needs elsewhere
              const activationMiles = item.CUMULATIVE_MILES ?? 0;
              isActive = item.isStart ? true : bookMiles >= activationMiles;
            } else {
              isActive = bookMiles >= item.CUMULATIVE_MILES;
            }

            // Hide trivia entirely until active
            if (!isCheckpoint && !isActive) {
              return null;
            }

            return (
              <PositionedCheckpoint
                key={item.name}
                item={item}
                isActive={isActive}
                type={type}
                baseX={baseX}
                baseY={baseY}
                centerX={width / 2}
                centerY={height / 2}
                translateX={translateX}
                translateY={translateY}
                scale={scale}
                showLabel={isCheckpoint && showCheckpointLabels}
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

      {/* Info System - Checkpoint/Trivia Info */}
      {currentItem && showInfoButtonOnce && (
        <Animated.View
          style={[styles.infoContainer, infoEnterStyle]}
          pointerEvents="box-none"
        >
          <InfoButton
            item={currentItem}
            type={itemType!}
            checkpointIndex={
              itemType === 'checkpoint' && currentCheckpointIndex !== null
                ? currentCheckpointIndex
                : undefined
            }
          />
        </Animated.View>
      )}

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

      {/* Info Modal */}
      <InfoModal visible={isModalVisible} onDismiss={closeModal} />

      {/* Test Input */}
      {!showWelcome && (
        <View style={[styles.testInputContainer, { bottom: keyboardOffset }]}>
          <Text style={styles.testInputLabel}>Test Miles:</Text>
          <TextInput
            style={styles.testInput}
            value={testMiles}
            onChangeText={t => {
              setTestMiles(t);
              const parsed = parseFloat(t);
              setMiles(isNaN(parsed) ? 0 : parsed);
            }}
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
  infoContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 100,
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
