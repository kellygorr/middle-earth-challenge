import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
// Modals are rendered globally in App.tsx
import {
  SettingsButton,
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
import { useJourneyProgressAnimation } from '../hooks/useJourneyProgressAnimation';
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
  const setShowSettings = useSettingsStore(state => state.setShowSettings);

  const keyboardOffset = useKeyboardOffset(20);
  const showWelcome = useSettingsStore(state => state.showWelcome);
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
    showStartupTooltip,
    tooltipPosition,
    observeMilesChanges,
    setShowStartupTooltip,
    setTooltipPosition,
    setObserveMilesChanges,
  } = useInfoStore();

  // Miles from progress store (source of truth)
  const miles = useProgressStore(state => state.miles);

  const setShowManualMilesModal = useSettingsStore(
    state => state.setShowManualMilesModal,
  );

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
    },
  });

  // Gate startup guidance to first map open only (no auto-open)
  const autoOpenRef = useRef(false);
  // Info button + tooltip managed in infoStore
  const infoButtonRef = useRef<any>(null);
  // Removed prevMilesRef; selection is store-driven
  // Observe miles changes moved to infoStore
  // (No extra activation guards; equality-based activation below)
  const { journeyProgressValue, animatedProgress } =
    useJourneyProgressAnimation(miles, [observeMilesChanges]);

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
    }
  }, [
    showWelcome,
    setShowStartupTooltip,
    setObserveMilesChanges,
    setTooltipPosition,
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
              gamePathInactiveColor={theme.colors.pathInactive}
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

      {/* Settings Button */}
      <Animated.View style={[styles.settingsButton, settingsEnterStyle]}>
        <SettingsButton
          onPress={() => setShowSettings(true)}
          size={iconSizes.medium}
          color={theme.colors.buttonPrimaryText}
        />
      </Animated.View>

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
          onPress={() => setShowPointLabels(!showPointLabels)}
          variant="primary"
          size="small"
          isMediumText={labelSize === 'large'}
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
          onPress={handleRecenter}
          size={iconSizes.medium}
          color={theme.colors.mapBackground}
        />
      </Animated.View>

      {/* Add Miles Button (always visible, independent overlay) */}
      <View
        style={[
          styles.addMilesButton,
          devMode ? { bottom: keyboardOffset + spacing.xxxl } : null,
        ]}
      >
        <PlusButton
          onPress={() => setShowManualMilesModal(true)}
          size={iconSizes.medium}
          color={theme.colors.textInverted}
        />
      </View>

      {/* Dev Miles (Developer mode) */}
      {devMode && <DevMiles keyboardOffset={keyboardOffset} />}
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
});
