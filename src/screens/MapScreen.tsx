import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Keyboard } from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
// Modals are rendered globally in App.tsx
import {
  SettingsButton,
  StatsButton,
  RecenterButton,
  PlusButton,
} from '../components/ButtonIcons';
import { iconSizes } from '../styles/global';
// PositionedPoint now used via PointLayer
import PointLayer from '../components/Point/PointLayer';
import MiddleEarthMapSkia from '../components/MiddleEarthMapSkia';
import Button, { InfoButton, TooltipButton } from '../components/Buttons';
import DevMiles from '../components/DevMiles';
import { spacing, borderRadius, iconButtonSizes } from '../styles/global';

import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useInitializationStore } from '../stores/initializationStore';
import { useInfoStore } from '../stores/infoStore';
import { useProgressStore } from '../stores/progressStore';
import checkpointsDataRaw from '../constants/checkpoints.json';
import triviaDataRaw from '../constants/trivia.json';
import { SVG_WIDTH, SVG_HEIGHT } from '../constants/gameConstants';
// pathProgress mapping handled within PointLayer
// typography not used in this screen
import { PointType } from '../types';
import { GAME_PATH } from '../constants/mapPathData';
import { useMapGestures } from '../hooks/useMapGestures';
import { useInitialAnimation } from '../hooks/useInitialAnimation';
import { useReactiveDimensions } from '../hooks/useReactiveDimensions';

import { useUniformMapLayout } from '../hooks/useUniformMapLayout';
import { useGameProgressAnimation } from '../hooks/useGameProgressAnimation';
import { useTooltipPositioning } from '../hooks/useTooltipPositioning';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
// InfoButton visibility derived via infoStore selector

// Data sets and SVG viewBox dimensions
const checkpointsData = checkpointsDataRaw as PointType[];
const triviaData = triviaDataRaw as PointType[];
// Sourced from gameConstants

export default function MapScreen() {
  const theme = useTheme();
  const { width, height } = useReactiveDimensions(); // reactive
  const setShowSettings = useUIStore(state => state.setShowSettings);
  const setShowStats = useUIStore(state => state.setShowStats);
  const setShowManualMilesModal = useUIStore(
    state => state.setShowManualMilesModal,
  );

  const keyboardOffset = useKeyboardOffset(20);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const phase = useInitializationStore(state => state.phase);
  const setPhase = useInitializationStore(state => state.setPhase);
  const gameProgressAnimEnabled = phase === 'active';
  const devMode = useSettingsStore(state => state.devMode);
  const showPointLabels = useSettingsStore(state => state.showPointLabels);
  const setShowPointLabels = useSettingsStore(
    state => state.setShowPointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);
  const labelSize = useSettingsStore(state => state.labelSize);

  // Info store for checkpoint/trivia info
  const {
    currentItem,
    itemType,
    isModalVisible,
    showInfo,
    openModal,
    clearStickyInfo,
    showStartupTooltip,
    tooltipPosition,
    observeMilesChanges,
    setShowStartupTooltip,
    setTooltipPosition,
    setObserveMilesChanges,
  } = useInfoStore();

  // Miles from progress store (source of truth)
  const miles = useProgressStore(state => state.miles);
  const syncMessage = useProgressStore(state => state.syncMessage);

  // Rotating animation for sync icon - step-based rotation in a circle
  const syncRotation = useSharedValue(0);

  useEffect(() => {
    if (syncMessage) {
      // Step rotation: move 45 degrees every 350ms
      const interval = setInterval(() => {
        syncRotation.value = withTiming(syncRotation.value + 45, {
          duration: 150,
          easing: Easing.out(Easing.ease),
        });
      }, 350);
      return () => clearInterval(interval);
    } else {
      syncRotation.value = 0;
    }
  }, [syncMessage, syncRotation]);

  const syncIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));

  const firstCheckpoint = checkpointsData[0];
  const {
    uniformScale,
    mapWidth,
    mapHeight,
    mapOffsetX,
    mapOffsetY,
    initialScrollX,
    initialScrollY,
  } = useUniformMapLayout(
    width,
    height,
    SVG_WIDTH,
    SVG_HEIGHT,
    firstCheckpoint,
    50,
    300,
    100,
  );

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
    onMapInteraction: clearStickyInfo,
  });

  // Initial animation
  const {
    initialBasePathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  } = useInitialAnimation({
    showWelcome,
    recenterOpacity,
    originMonitorEnabled,
    resetToOrigin,
    onInfoAnimationComplete: () => {
      // Run once after welcome dismissal; do NOT auto-open the modal
      const hasShownStartupGuidance = autoOpenRef.current;
      if (!hasShownStartupGuidance && currentItem) {
        // Display startup tooltip only at game start (0 miles)
        if ((miles || 0) === 0) {
          setShowStartupTooltip(true);
        }
        autoOpenRef.current = true;
        setObserveMilesChanges(true);
      }
      // Enable game progress animation after path reveal completes
      setPhase('active');
    },
  });

  // Gate startup guidance to first map open only (no auto-open)
  const autoOpenRef = useRef(false);
  // Info button + tooltip managed in infoStore
  const infoButtonRef = useRef<any>(null);
  // Removed prevMilesRef; selection is store-driven
  // Observe miles changes moved to infoStore
  // (No extra activation guards; equality-based activation below)
  const { gameProgressValue, animatedProgress } = useGameProgressAnimation(
    miles,
    gameProgressAnimEnabled,
    [observeMilesChanges],
  );

  const shouldShowInfoButton = useInfoStore(state =>
    state.getShouldShowInfoButton(animatedProgress),
  );

  // Tooltip anchor: prefer InfoButton when visible; otherwise no anchor
  const tooltipAnchorRef = useRef<any>(null);
  useEffect(() => {
    tooltipAnchorRef.current = shouldShowInfoButton
      ? infoButtonRef.current
      : null;
  }, [shouldShowInfoButton]);

  // Removed older exact-checkpoint effect; selection now driven by store selector

  // Determine current active checkpoint/trivia via store selector (exact miles)
  useEffect(() => {
    if (isModalVisible) return; // Respect manual selection while modal is open
    const active = useProgressStore.getState().getActiveInfoItem();
    if (!active) return;
    const { item, type } = active;
    if (currentItem?.name !== item.name || itemType !== type) {
      showInfo(item as PointType, type);
    }
  }, [
    miles,
    currentItem,
    itemType,
    showInfo,
    observeMilesChanges,
    isModalVisible,
  ]);

  // Reset startup guidance when welcome is shown again
  useEffect(() => {
    if (showWelcome) {
      setShowStartupTooltip(false);
      autoOpenRef.current = false;
      setObserveMilesChanges(false);
      setTooltipPosition(null);
      // Reset to ready phase while welcome is visible
      if (phase !== 'loading' && phase !== 'ready') {
        setPhase('ready');
      }
    }
  }, [
    showWelcome,
    setShowStartupTooltip,
    setObserveMilesChanges,
    setTooltipPosition,
    phase,
    setPhase,
  ]);

  // Hide tooltips when the info modal opens (user acted)
  useEffect(() => {
    if (isModalVisible && showStartupTooltip) {
      setShowStartupTooltip(false);
    }
  }, [isModalVisible, showStartupTooltip, setShowStartupTooltip]);

  // Hide startup tooltip once user travels beyond 0 miles
  useEffect(() => {
    if ((miles || 0) > 0 && showStartupTooltip) {
      setShowStartupTooltip(false);
    }
  }, [miles, showStartupTooltip, setShowStartupTooltip]);

  useTooltipPositioning(
    tooltipAnchorRef,
    showStartupTooltip && shouldShowInfoButton,
    setTooltipPosition,
    spacing.xs,
    width,
    height,
  );

  // Keyboard offset handled by useKeyboardOffset

  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        { backgroundColor: theme.colors.mapBackground },
      ]}
      onStartShouldSetResponderCapture={() => {
        if (showStartupTooltip) setShowStartupTooltip(false);
        Keyboard.dismiss();
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
              activePathColor={theme.colors.checkpointUnlocked}
              inactivePathColor={theme.colors.pathInactive}
              gamePathData={GAME_PATH}
              zoomScale={scale}
              gameProgress={gameProgressValue}
              initialBasePathProgress={initialBasePathProgress}
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

          {/* Points: Checkpoints and Trivia */}
          <PointLayer
            checkpoints={checkpointsData}
            trivia={triviaData}
            uniformScale={uniformScale}
            mapOffsetX={mapOffsetX}
            mapOffsetY={mapOffsetY}
            centerX={width / 2}
            centerY={height / 2}
            translateX={translateX}
            translateY={translateY}
            scale={scale}
            showPointLabels={showPointLabels}
            animatedProgress={animatedProgress}
            onItemPress={(item, type) => {
              showInfo(item, type);
              openModal();
            }}
          />
        </View>
      </GestureDetector>

      {/* Stats Button */}
      <Animated.View style={[styles.statsButton, settingsEnterStyle]}>
        <StatsButton
          onPress={() => {
            clearStickyInfo();
            setShowStats(true);
          }}
          size={iconSizes.medium}
          color={theme.colors.buttonPrimaryText}
        />
      </Animated.View>

      {/* Settings Button */}
      <Animated.View style={[styles.settingsButton, settingsEnterStyle]}>
        <SettingsButton
          onPress={() => {
            clearStickyInfo();
            setShowSettings(true);
          }}
          size={iconSizes.medium}
          color={theme.colors.buttonPrimaryText}
          hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
        />
      </Animated.View>

      {/* Sync Message Toast */}
      {syncMessage && (
        <Animated.View
          style={styles.syncMessageContainer}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <View
            style={[
              styles.syncMessageContent,
              { backgroundColor: theme.colors.buttonPrimary },
            ]}
          >
            <Animated.View style={syncIconStyle}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12H20C20 7.58 16.42 4 12 4Z"
                  fill={theme.colors.buttonPrimaryText}
                />
                <Path
                  d="M12 20V23L16 19L12 15V18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20Z"
                  fill={theme.colors.buttonPrimaryText}
                />
              </Svg>
            </Animated.View>
            <Text
              style={[
                styles.syncMessageText,
                { color: theme.colors.buttonPrimaryText },
              ]}
            >
              {syncMessage}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Info System - Checkpoint/Trivia Info (derived via store selector) */}
      {currentItem && shouldShowInfoButton && (
        <Animated.View
          style={[styles.infoContainer, infoEnterStyle]}
          pointerEvents="box-none"
        >
          <InfoButton ref={infoButtonRef} item={currentItem} type={itemType!} />
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
          onPress={() => {
            clearStickyInfo();
            setShowPointLabels(!showPointLabels);
          }}
          variant="primary"
          size="small"
          isMediumText={labelSize === 'large'}
          hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          Labels
        </Button>
      </Animated.View>

      {/* Recenter Button */}
      <Animated.View
        style={[
          styles.recenterButton,
          recenterButtonStyle,
          { bottom: spacing.md + iconButtonSizes.medium + spacing.sm },
          devMode
            ? {
                bottom:
                  keyboardOffset +
                  spacing.xxxl +
                  iconButtonSizes.medium +
                  spacing.sm,
              }
            : null,
        ]}
      >
        <RecenterButton
          onPress={() => {
            clearStickyInfo();
            handleRecenter();
          }}
          size={iconSizes.medium}
          color={theme.colors.mapBackground}
          hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
        />
      </Animated.View>

      {/* Add Miles Button (always visible, independent overlay) */}
      <Animated.View
        style={[
          styles.addMilesButton,
          devMode ? { bottom: keyboardOffset + spacing.xxxl } : null,
          settingsEnterStyle,
        ]}
      >
        <PlusButton
          onPress={() => {
            clearStickyInfo();
            setShowManualMilesModal(true);
          }}
          size={iconSizes.medium}
          color={theme.colors.textInverted}
          hitSlop={{ top: 8, right: 16, bottom: 16, left: 8 }}
        />
      </Animated.View>

      {/* Dev Miles (Developer mode) */}
      {devMode && !showWelcome && <DevMiles keyboardOffset={keyboardOffset} />}

      {/* Loading overlay - hides map until ready */}
      {phase === 'loading' && <View style={styles.loadingOverlay} />}
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
    top: spacing.xl2,
    right: spacing.md,
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsButton: {
    position: 'absolute',
    top: spacing.xl2,
    right: spacing.md + iconButtonSizes.medium + spacing.sm,
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
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
    top: spacing.xl2 + iconButtonSizes.medium + spacing.sm,
    right: spacing.md,
  },
  recenterButton: {
    position: 'absolute',
    right: spacing.md,
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMilesButton: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncMessageContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  syncMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  syncMessageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
});
