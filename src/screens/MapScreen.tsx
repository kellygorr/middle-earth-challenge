import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar, Keyboard } from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
// Modals are rendered globally in App.tsx
import { IconButton } from '../components/Buttons';
import {
  SettingsIcon,
  StatsIcon,
  RecenterIcon,
  PlusIcon,
} from '../assets/icons';
import { iconSizes } from '../styles/global';
// PositionedPoint now used via PointLayer
import PointLayer from '../components/Point/PointLayer';
import MiddleEarthMapSkia from '../components/MiddleEarthMapSkia';
import Button, { InfoButton, TooltipButton } from '../components/Buttons';
import DevView from '../components/DevView';
import SyncIndicator from '../components/SyncIndicator';

import { spacing } from '../styles/global';
import { formatDistance } from '../utils/date';

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
  const insets = useSafeAreaInsets();
  const pushModal = useUIStore(state => state.pushModal);

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
  const useMiles = useSettingsStore(state => state.useMiles);

  // Info store for checkpoint/trivia info
  const {
    currentItem,
    itemType,
    showInfo,
    hideInfo,
    openModal,
    clearStickyInfo,
    showStartupTooltip,
    observeMilesChanges,
    stickyUntilMilesChange,
    lastMilesAtSelection,
    setShowStartupTooltip,
    setTooltipPosition,
    setObserveMilesChanges,
  } = useInfoStore();
  // Check if info modal is open via SharedModal stack
  const isInfoModalOpen = useUIStore(state => state.isModalOpen('info'));

  // Miles from progress store (source of truth)
  const miles = useProgressStore(state => state.miles);

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

  // Read sync phase early so we can pass it to the initial animation hook
  // (which decides whether to play the path reveal when welcome dismisses).
  const isSyncing = useProgressStore(
    state => state.syncStatus.phase === 'syncing',
  );

  // Drives the small red badge on the Settings icon when there's an
  // unresolved sync problem. Cleared by a successful sync or by the user
  // dismissing the banner inside Settings.
  const hasSyncError = useProgressStore(state => state.lastSyncError !== null);

  // Initial animation
  const {
    initialBasePathProgress,
    settingsEnterStyle,
    labelsEnterStyle,
    infoEnterStyle,
  } = useInitialAnimation({
    showWelcome,
    isSyncing,
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

  // --- Catching-up visual state -------------------------------------------
  // While syncing, pulse the active path color between the normal
  // `pathProgress` and the muted `pathInactive` so the journey path itself
  // signals "not live yet". Map background gets a subtle dim by lowering
  // opacity on the Skia wrapper.
  // Map background tint pulse — gentle (∼3s cycle).
  const pulse = useSharedValue(0);
  // Shimmer progress — 0→1 loop driving a traveling highlight along the
  // path (the "beam running down the wire" sync indicator). Color is
  // handled by a tight gradient shader inside the map component.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    if (isSyncing) {
      pulse.value = 0;
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, {
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        false,
      );
      shimmer.value = 0;
      shimmer.value = withRepeat(
        withTiming(1.06, {
          duration: 2200,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(0, { duration: 400 });
      shimmer.value = withTiming(0, { duration: 200 });
    }
  }, [isSyncing, pulse, shimmer]);

  // Animated tint color rendered inside the Skia canvas (above map
  // artwork, below the journey path) so the path and checkpoints stay
  // crisp on top of the dimmed map.
  const mapTintColor = useDerivedValue(
    () =>
      interpolateColor(
        pulse.value,
        [0, 1],
        ['rgba(40,40,60,0)', 'rgba(40,40,60,0.35)'],
      ),
    [],
  );
  // Animated style for the full-screen tint overlay sitting behind the
  // Skia canvas, so the pulse fills the gutter visible when zoomed out.
  const tintOverlayStyle = useAnimatedStyle(
    () => ({ backgroundColor: mapTintColor.value }),
    [],
  );
  // ------------------------------------------------------------------------

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
    if (isInfoModalOpen) return; // Respect manual selection while modal is open
    const active = useProgressStore.getState().getActiveInfoItem();
    if (!active) {
      // No active item at current position
      // Don't clear if sticky and miles haven't changed
      if (stickyUntilMilesChange && lastMilesAtSelection != null) {
        const unchanged = Math.abs((miles || 0) - lastMilesAtSelection) < 1e-6;
        if (unchanged) return; // Keep sticky item visible
      }
      if (currentItem) {
        hideInfo();
      }
      return;
    }
    const { item, type } = active;
    if (currentItem?.name !== item.name || itemType !== type) {
      // Auto-display: not sticky (sticky=false)
      showInfo(item as PointType, type, false);
    }
  }, [
    miles,
    currentItem,
    itemType,
    showInfo,
    hideInfo,
    observeMilesChanges,
    isInfoModalOpen,
    stickyUntilMilesChange,
    lastMilesAtSelection,
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
    if (isInfoModalOpen && showStartupTooltip) {
      setShowStartupTooltip(false);
    }
  }, [isInfoModalOpen, showStartupTooltip, setShowStartupTooltip]);

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

  console.log('[MapScreen] render', {
    phase,
    showWelcome,
    miles,
    mapBg: theme.colors.mapBackground,
    width,
    height,
    mapWidth,
    mapHeight,
  });

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
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, tintOverlayStyle]}
          />
          <Animated.View style={[styles.svgWrapper, animatedStyle]}>
            <MiddleEarthMapSkia
              width={mapWidth}
              height={mapHeight}
              colorize={colorizeMap}
              reducedTitles={reducedMapTitles}
              defaultColor={theme.colors.mapDefaultColor}
              activePathColor={theme.colors.checkpointUnlocked}
              shimmerProgress={shimmer}
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
            currentMiles={miles}
            onItemPress={(item, type) => {
              showInfo(item, type);
              openModal();
            }}
          />
        </View>
      </GestureDetector>

      {/* Black bar for notch safe area in landscape */}
      {insets.left > 0 && (
        <View
          style={[styles.notchBar, { left: 0, width: insets.left }]}
          pointerEvents="none"
        />
      )}

      {/* Traveled Miles Display - opens stats modal */}
      {miles > 0 && (
        <Animated.View
          style={[
            styles.milesContainer,
            {
              top: insets.top + 60,
              left: insets.left,
            },
            settingsEnterStyle,
          ]}
        >
          <Button
            onPress={() => {
              clearStickyInfo();
              pushModal({ type: 'stats' });
            }}
            variant="primary"
            size={
              labelSize === 'small'
                ? 'small'
                : labelSize === 'large'
                ? 'large'
                : 'default'
            }
            textSize={
              labelSize === 'small'
                ? 'small'
                : labelSize === 'large'
                ? 'large'
                : 'default'
            }
            flatSide="left"
            isLabelButton
          >
            {formatDistance(miles, {
              includeUnits: true,
              useLargeUnit: true,
              noDecimals: true,
              useMiles,
            })}
          </Button>
        </Animated.View>
      )}

      {/* UI Overlay - SafeAreaView handles all edges */}
      <SafeAreaView style={styles.uiOverlay} pointerEvents="box-none">
        {/* Top Row */}
        <View style={styles.topRow} pointerEvents="box-none">
          {/* Left Column: InfoButton */}
          <View style={styles.topLeftColumn} pointerEvents="box-none">
            {/* Info System - Checkpoint/Trivia Info (derived via store selector) */}
            {currentItem && shouldShowInfoButton ? (
              <Animated.View
                style={[styles.infoContainer, infoEnterStyle]}
                pointerEvents="box-none"
              >
                <InfoButton
                  ref={infoButtonRef}
                  item={currentItem}
                  type={itemType!}
                />
                {/* Tooltip - positioned directly below InfoButton using relative layout */}
                {showStartupTooltip && (
                  <TooltipButton
                    onPress={() => {
                      if (showStartupTooltip) setShowStartupTooltip(false);
                      openModal();
                    }}
                  />
                )}
              </Animated.View>
            ) : null}
          </View>

          {/* Right side buttons - column layout */}
          <View style={styles.topRightColumn} pointerEvents="box-none">
            {/* Stats + Settings row */}
            <View style={styles.topRightButtons} pointerEvents="box-none">
              {/* Stats Button */}
              <Animated.View style={settingsEnterStyle}>
                <IconButton
                  icon={<StatsIcon size={iconSizes.medium} />}
                  onPress={() => {
                    clearStickyInfo();
                    pushModal({ type: 'stats' });
                  }}
                />
              </Animated.View>

              {/* Settings Button */}
              <Animated.View style={settingsEnterStyle}>
                <IconButton
                  icon={<SettingsIcon size={iconSizes.medium} />}
                  onPress={() => {
                    clearStickyInfo();
                    pushModal({ type: 'settings' });
                  }}
                  hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  showBadge={hasSyncError}
                />
              </Animated.View>
            </View>

            {/* Labels Toggle */}
            <Animated.View style={labelsEnterStyle}>
              <Button
                onPress={() => {
                  clearStickyInfo();
                  setShowPointLabels(!showPointLabels);
                }}
                variant="primary"
                type="label"
                size="small"
                textSize={
                  labelSize === 'small'
                    ? 'small'
                    : labelSize === 'large'
                    ? 'large'
                    : 'default'
                }
                hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
                isLabelButton
              >
                Labels
              </Button>
            </Animated.View>
          </View>
        </View>

        {/* Bottom Row: sync pill on the left, icon column (recenter / +) on the
            right. flexDirection: row + alignItems: flex-end keeps the pill's
            bottom edge level with the + button's bottom edge, regardless of
            their differing heights. */}
        <View
          style={[
            styles.bottomRow,
            devMode
              ? { marginBottom: keyboardOffset + spacing.xxxl + spacing.xxl }
              : null,
          ]}
          pointerEvents="box-none"
        >
          {/* Sync pill: absolutely positioned so it centers relative to the
              full screen width, independent of the icon column on the right. */}
          <View style={styles.syncPillSlot} pointerEvents="none">
            {!showWelcome && <SyncIndicator />}
          </View>

          {/* Icon column: recenter on top, + on bottom. */}
          <View style={styles.bottomIconColumn} pointerEvents="box-none">
            {/* Recenter Button */}
            <Animated.View
              style={[{ alignSelf: 'flex-end' }, recenterButtonStyle]}
            >
              <IconButton
                icon={
                  <RecenterIcon
                    size={iconSizes.medium}
                    color={theme.colors.mapBackground}
                  />
                }
                onPress={() => {
                  clearStickyInfo();
                  handleRecenter();
                }}
                hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
              />
            </Animated.View>

            {/* Add Miles Button — disabled while syncing to avoid racing
                manual edits against in-flight chunk writes. */}
            <Animated.View
              style={[{ alignSelf: 'flex-end' }, settingsEnterStyle]}
            >
              <IconButton
                icon={<PlusIcon size={iconSizes.medium} />}
                onPress={() => {
                  clearStickyInfo();
                  pushModal({ type: 'miles' });
                }}
                hitSlop={{ top: 8, right: 16, bottom: 16, left: 8 }}
                disabled={isSyncing}
              />
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>

      {/* Dev Miles (Developer mode) */}
      {devMode && !showWelcome && <DevView keyboardOffset={keyboardOffset} />}

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
  uiOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topRightColumn: {
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  topRightButtons: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  topLeftColumn: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoContainer: {
    zIndex: 100,
  },
  milesContainer: {
    position: 'absolute',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  syncPillSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  bottomIconColumn: {
    alignItems: 'flex-end',
    gap: spacing.md,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  notchBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 50,
  },
});
