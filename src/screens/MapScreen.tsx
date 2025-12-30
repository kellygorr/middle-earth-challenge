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
import { SettingsButton, RecenterButton } from '../components/ButtonIcons';
import { iconSizes } from '../styles/global';
import PositionedCheckpoint from '../components/Checkpoint/PositionedCheckpoint';
import MiddleEarthMapSkia from '../components/MiddleEarthMapSkia';
import Button, { InfoButton, TooltipButton } from '../components/Buttons';
import InfoModal from '../components/InfoModal';
import { spacing } from '../styles/global';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useInfoStore } from '../stores/infoStore';
import { useProgressStore } from '../stores/progressStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import triviaDataRaw from '../constants/trivia.json';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
// typography not used in this screen
import { CheckpointType } from '../types';
import { GAME_PATH } from '../constants/mapPathData';
import { useMapGestures } from '../hooks/useMapGestures';
import { useInitialAnimation } from '../hooks/useInitialAnimation';
import { useReactiveDimensions } from '../hooks/useReactiveDimensions';

// Data sets and SVG viewBox dimensions
const checkpointsData = checkpointsDataRaw as CheckpointType[];
const triviaData = triviaDataRaw as CheckpointType[];
const SVG_WIDTH = 3059.47;
const SVG_HEIGHT = 2350.67;

export default function MapScreen() {
  const theme = useTheme();
  const { width, height } = useReactiveDimensions(); // reactive
  const [showSettings, setShowSettings] = useState(false);
  const [testMiles, setTestMiles] = useState('0');
  const [keyboardOffset, setKeyboardOffset] = useState(20);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const devMode = useSettingsStore(state => state.devMode);
  const showCheckpointLabels = useSettingsStore(
    state => state.showCheckpointLabels,
  );
  const setShowCheckpointLabels = useSettingsStore(
    state => state.setShowCheckpointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);
  const labelSize = useSettingsStore(state => state.labelSize);

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
        // Show the InfoButton once and display a startup tooltip instead of auto-opening
        setShowInfoButtonOnce(true);
        setShowStartupTooltip(true);
        autoOpenRef.current = true;
        setObserveMilesChanges(true);
      }
    },
  });

  // Gate auto-open to first map open only
  const autoOpenRef = useRef(false);
  // Show Info button only once when map opens; hide on progress changes
  const [showInfoButtonOnce, setShowInfoButtonOnce] = useState(false);
  const [showStartupTooltip, setShowStartupTooltip] = useState(false);
  const infoButtonRef = useRef<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  // Track previous miles, seeded with current store value to avoid first-render hide
  const prevMilesRef = useRef<number>(miles || 0);
  // Begin observing miles changes only after info animation completes
  const [observeMilesChanges, setObserveMilesChanges] = useState(false);
  // (No extra activation guards; equality-based activation below)

  // Journey progress
  const journeyProgressValue = useSharedValue(
    miles ? mapBookMilesToPathProgress(miles) : 0,
  );

  useEffect(() => {
    journeyProgressValue.value = mapBookMilesToPathProgress(miles || 0);
  }, [miles, journeyProgressValue, showInfoButtonOnce, observeMilesChanges]);

  // Show/hide InfoButton when landing on or crossing a checkpoint mile
  useEffect(() => {
    // Do not override while a modal is open due to manual selection
    if (isModalVisible) return;
    const current = miles || 0;
    const prev = prevMilesRef.current || 0;

    // Only change InfoButton visibility when miles actually change
    if (current !== prev) {
      // Prefer exact match with small float tolerance; fallback to crossing detection
      const isExact = (a: number, b: number) => Math.abs(a - b) < 1e-6;
      let idx = checkpointsData.findIndex(cp =>
        isExact(cp.CUMULATIVE_MILES, current),
      );
      if (idx === -1 && current > prev) {
        idx = checkpointsData.findIndex(
          cp => cp.CUMULATIVE_MILES > prev && cp.CUMULATIVE_MILES <= current,
        );
      }

      if (idx !== -1) {
        const reached = checkpointsData[idx];
        if (currentItem?.name !== reached.name || itemType !== 'checkpoint') {
          showInfo(reached, 'checkpoint');
        }
        setCurrentCheckpointIndex(idx);
        if (!showInfoButtonOnce) setShowInfoButtonOnce(true);
      } else {
        // Hide InfoButton when miles change away from any checkpoint
        if (showInfoButtonOnce) {
          setShowInfoButtonOnce(false);
        }
        // Additionally, if we have a checkpoint selected and have moved beyond it, force-hide
        if (
          showInfoButtonOnce &&
          itemType === 'checkpoint' &&
          currentItem &&
          'CUMULATIVE_MILES' in currentItem &&
          current > (currentItem as any).CUMULATIVE_MILES
        ) {
          setShowInfoButtonOnce(false);
        }
      }

      // Update previous miles after handling detection
      prevMilesRef.current = current;
    }
  }, [
    miles,
    showInfo,
    currentItem,
    itemType,
    showInfoButtonOnce,
    isModalVisible,
  ]);

  // Determine current active checkpoint and trivia
  useEffect(() => {
    // Respect manual selection while the modal is open
    if (isModalVisible) return;
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

    // Prioritize trivia over checkpoints when both are available,
    // unless we're showing a freshly reached checkpoint's InfoButton
    if (currentTrivia && !(showInfoButtonOnce && itemType === 'checkpoint')) {
      if (currentItem?.name !== currentTrivia.name || itemType !== 'trivia') {
        showInfo(currentTrivia, 'trivia');
      }
      // After initial animation completes, show InfoButton once (no trivia tooltip)
      if (observeMilesChanges) {
        setShowInfoButtonOnce(true);
      }
    } else if (currentCheckpoint) {
      if (
        currentItem?.name !== currentCheckpoint.name ||
        itemType !== 'checkpoint'
      ) {
        showInfo(currentCheckpoint, 'checkpoint');
      }
    }
  }, [
    miles,
    currentItem,
    itemType,
    showInfo,
    showInfoButtonOnce,
    observeMilesChanges,
    isModalVisible,
  ]);

  // Reset Info button gating when welcome is shown again
  useEffect(() => {
    if (showWelcome) {
      setShowInfoButtonOnce(false);
      setShowStartupTooltip(false);
      autoOpenRef.current = false;
      setObserveMilesChanges(false);
      setTooltipPosition(null);
    }
  }, [showWelcome]);

  // Hide tooltips when the info modal opens (user acted)
  useEffect(() => {
    if (isModalVisible && showStartupTooltip) {
      setShowStartupTooltip(false);
    }
  }, [isModalVisible, showStartupTooltip]);

  // Measure anchor (InfoButton or activated trivia) and position tooltip under it
  useEffect(() => {
    if (!showStartupTooltip) return;
    const node = infoButtonRef.current as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    const measure = () => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          const top = y + h + spacing.xs;
          const left = x;
          setTooltipPosition({ top, left });
        });
      } catch {}
    };
    // Measure on next frame to ensure layout committed after animation
    requestAnimationFrame(measure);
  }, [showStartupTooltip]);

  // Re-measure on dimension changes while tooltip is visible
  useEffect(() => {
    if (!showStartupTooltip) return;
    const node = infoButtonRef.current as any;
    if (!node || typeof node.measureInWindow !== 'function') return;
    requestAnimationFrame(() => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          const top = y + h + spacing.xs;
          const left = x;
          setTooltipPosition({ top, left });
        });
      } catch {}
    });
  }, [width, height, showStartupTooltip]);

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
      onStartShouldSetResponderCapture={() => {
        if (showStartupTooltip) setShowStartupTooltip(false);
        return false;
      }}
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
                onPress={() => {
                  // Show info for the tapped marker and open modal
                  showInfo(item, type);
                  // Track checkpoint index for numbering if applicable
                  if (type === 'checkpoint') {
                    const idx = checkpointsData.findIndex(
                      cp => cp.name === item.name,
                    );
                    setCurrentCheckpointIndex(idx !== -1 ? idx : null);
                    // Activate InfoButton on manual open regardless of miles; miles change will hide it as usual
                    setShowInfoButtonOnce(true);
                  }
                  openModal();
                }}
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
          <SettingsButton
            size={iconSizes.medium}
            color={theme.colors.buttonPrimaryText}
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
            ref={infoButtonRef}
            item={currentItem}
            type={itemType!}
            checkpointIndex={
              itemType === 'checkpoint' && currentCheckpointIndex !== null
                ? currentCheckpointIndex
                : undefined
            }
          />
          {showStartupTooltip && tooltipPosition && (
            <View
              style={[
                styles.tooltipOverlay,
                {
                  top: tooltipPosition.top,
                  left: tooltipPosition.left,
                },
              ]}
            >
              <TooltipButton
                onPress={() => {
                  if (showStartupTooltip) setShowStartupTooltip(false);
                  openModal();
                }}
              />
            </View>
          )}
        </Animated.View>
      )}

      {/* Labels Toggle */}
      <Animated.View style={[styles.labelsButton, labelsEnterStyle]}>
        <Button
          onPress={() => setShowCheckpointLabels(!showCheckpointLabels)}
          variant="primary"
          size="small"
          isMediumText={labelSize === 'large'}
        >
          Labels
        </Button>
      </Animated.View>

      {/* Recenter Button */}
      <Animated.View style={[styles.recenterButton, recenterButtonStyle]}>
        <TouchableOpacity
          style={styles.recenterButtonTouch}
          onPress={handleRecenter}
          activeOpacity={0.7}
        >
          <RecenterButton
            size={iconSizes.medium}
            color={theme.colors.mapBackground}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Info Modal */}
      <InfoModal visible={isModalVisible} onDismiss={closeModal} />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onDismiss={() => setShowSettings(false)}
      />

      {/* Test Input (Developer mode) */}
      {devMode && (
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
  tooltipOverlay: {
    position: 'absolute',
    zIndex: 101,
    pointerEvents: 'box-none',
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
