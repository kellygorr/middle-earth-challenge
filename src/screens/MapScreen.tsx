import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, StatusBar, Keyboard, Pressable } from 'react-native';
import { Skia, useCanvasRef } from '@shopify/react-native-skia';
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
  cancelAnimation,
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
import FriendProgressMarkerLayer from '../components/FriendProgressMarkerLayer';

import { spacing } from '../styles/global';
import { formatDistance } from '../utils/date';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { milesToSteps } from '../utils/stride';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useInitializationStore } from '../stores/initializationStore';
import { useInfoStore } from '../stores/infoStore';
import { useProgressStore } from '../stores/progressStore';
import { useFriendProgressStore } from '../stores/friendProgressStore';
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
import { useLivePedometerDelta } from '../hooks/useLivePedometerDelta';
import { useStepCountHighlight } from '../hooks/useStepCountHighlight';

import { useUniformMapLayout } from '../hooks/useUniformMapLayout';
import { useGameProgressAnimation } from '../hooks/useGameProgressAnimation';
import { useTooltipPositioning } from '../hooks/useTooltipPositioning';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';
import { usePrefersReducedMotion } from '../hooks/useReduceMotion';
// InfoButton visibility derived via infoStore selector

// Data sets and SVG viewBox dimensions
const checkpointsData = checkpointsDataRaw as PointType[];
const triviaData = triviaDataRaw as PointType[];
// Sourced from gameConstants

const PATH_REVEAL_EDGE_OUTSET = 4;
const PATH_REVEAL_SEARCH_STEP = 0.001;

const findPathRevealStart = ({
  milestoneMiles,
  uniformScale,
  mapOffsetX,
  mapOffsetY,
  translateX,
  translateY,
  screenWidth,
  screenHeight,
}: {
  milestoneMiles: number;
  uniformScale: number;
  mapOffsetX: number;
  mapOffsetY: number;
  translateX: number;
  translateY: number;
  screenWidth: number;
  screenHeight: number;
}) => {
  const milestoneProgress = mapBookMilesToPathProgress(milestoneMiles);
  const path = Skia.Path.MakeFromSVGString(GAME_PATH);
  const contour = path ? Skia.ContourMeasureIter(path, false, 1).next() : null;
  if (!contour) return milestoneProgress;

  for (
    let progress = milestoneProgress;
    progress >= 0;
    progress -= PATH_REVEAL_SEARCH_STEP
  ) {
    const [position] = contour.getPosTan(contour.length() * progress);
    const x = position.x * uniformScale - mapOffsetX + translateX;
    const y = position.y * uniformScale - mapOffsetY + translateY;
    const insideRevealBounds =
      x >= -PATH_REVEAL_EDGE_OUTSET &&
      x <= screenWidth + PATH_REVEAL_EDGE_OUTSET &&
      y >= -PATH_REVEAL_EDGE_OUTSET &&
      y <= screenHeight + PATH_REVEAL_EDGE_OUTSET;

    if (!insideRevealBounds) {
      return progress;
    }
  }

  return 0;
};

interface MapScreenProps {
  mapReadyEnabled?: boolean;
  mapReadyToken?: number;
  onMapReady?: () => void;
}

export default function MapScreen({
  mapReadyEnabled = false,
  mapReadyToken = 0,
  onMapReady,
}: MapScreenProps = {}) {
  const theme = useTheme();
  const { width, height } = useReactiveDimensions(); // reactive
  const insets = useSafeAreaInsets();
  const pushModal = useUIStore(state => state.pushModal);

  const keyboardOffset = useKeyboardOffset(20);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const phase = useInitializationStore(state => state.phase);
  const setPhase = useInitializationStore(state => state.setPhase);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotionEnabled = prefersReducedMotion === true;
  // Normal motion: keep active-path animation gated on `phase === 'active'`
  // so it doesn't run under Welcome. Reduced motion: show the active path
  // immediately (no hidden state) by enabling progress updates right away;
  // useGameProgressAnimation will still avoid animation and snap directly.
  const gameProgressAnimEnabled =
    prefersReducedMotion !== null && (phase === 'active' || reduceMotionEnabled);
  const devMode = useSettingsStore(state => state.devMode);
  const showPointLabels = useSettingsStore(state => state.showPointLabels);
  const setShowPointLabels = useSettingsStore(
    state => state.setShowPointLabels,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);
  const labelSize = useSettingsStore(state => state.labelSize);
  const useMiles = useSettingsStore(state => state.useMiles);
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const friendProgressParticipants = useFriendProgressStore(
    state => state.participants,
  );
  const [showFriendProgress, setShowFriendProgress] = useState(true);
  const [hasInitialPathRevealed, setHasInitialPathRevealed] = useState(
    !showWelcome,
  );
  const [progressAnimationCycle, setProgressAnimationCycle] = useState(0);
  const previousShowWelcomeRef = useRef(showWelcome);

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

  const realMiles = useProgressStore(state => state.miles);
  const testOverrideMiles = useProgressStore(state => state.testOverrideMiles);
  const miles = testOverrideMiles ?? realMiles;

  // Total lifetime step count, shown in a small chip below the miles
  // button when the user is in pedometer mode. Health-app users don't
  // see it because Health Connect / Apple Health is a "distance from
  // any source" abstraction — a step counter would feel out of place
  // and possibly wrong (steps aren't reported by e.g. treadmill sources).
  //
  // The display is the sum of two parts so the counter can visibly tick
  // up while the user is walking with the app open, even though the
  // pedometer only commits to SQLite every ~2 minutes:
  //   totalSteps    = committedSteps + liveDelta
  //   committedSteps = `progressStore.steps` — mirrors
  //                    `progress_snapshot.steps` (SUM of every closed
  //                    distance_entries.steps), maintained by the same
  //                    writers that update `miles`. O(1) read.
  //   liveDelta      = pedometer steps in the OPEN range
  //                    [lastSyncTimestamp, now]. Pedometer-only — HC
  //                    can't be queried live. See `useLivePedometerDelta`.
  const committedSteps = useProgressStore(state => state.steps);
  const liveDelta = useLivePedometerDelta();

  const totalSteps =
    testOverrideMiles !== null
      ? milesToSteps(testOverrideMiles)
      : committedSteps + liveDelta;
  const stepCountHighlightStyle = useStepCountHighlight(
    totalSteps,
    theme.colors.buttonPrimaryText,
    theme.colors.uiStepIncrease,
  );

  const firstCheckpoint = checkpointsData[0];
  const rivendellCheckpoint =
    checkpointsData.find(checkpoint => checkpoint.name === 'Rivendell') ??
    firstCheckpoint;
  const lothlorienCheckpoint =
    checkpointsData.find(checkpoint => checkpoint.name === 'Lothlorien') ??
    rivendellCheckpoint;
  const hasReachedRivendell = miles >= rivendellCheckpoint.CUMULATIVE_MILES;
  const hasReachedLothlorien = miles >= lothlorienCheckpoint.CUMULATIVE_MILES;
  const homeCheckpoint = hasReachedLothlorien
    ? lothlorienCheckpoint
    : hasReachedRivendell
    ? rivendellCheckpoint
    : firstCheckpoint;
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
    homeCheckpoint,
    hasReachedLothlorien ? 40 : hasReachedRivendell ? 60 : 50,
    hasReachedLothlorien ? 300 : hasReachedRivendell ? 250 : 300,
    hasReachedLothlorien ? 60 : hasReachedRivendell ? 85 : 100,
    hasReachedLothlorien ? 260 : hasReachedRivendell ? 240 : 200,
  );
  const pathRevealStart = useMemo(() => {
    // Always compute the off-screen reveal-start point rather than
    // gating on hasReachedRivendell: for early users (still near
    // Hobbiton) the backward search naturally resolves to 0 anyway,
    // since their whole traveled distance is already inside the
    // viewport — so this is a no-op for them and just unifies the logic
    // for every camera position instead of special-casing by checkpoint.
    return findPathRevealStart({
      milestoneMiles: homeCheckpoint.CUMULATIVE_MILES,
      uniformScale,
      mapOffsetX,
      mapOffsetY,
      translateX: initialScrollX,
      translateY: initialScrollY,
      screenWidth: width,
      screenHeight: height,
    });
  }, [
    homeCheckpoint.CUMULATIVE_MILES,
    uniformScale,
    mapOffsetX,
    mapOffsetY,
    initialScrollX,
    initialScrollY,
    width,
    height,
  ]);

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
  const hasSyncError = useProgressStore(state =>
    state.troubleshootingIssues.some(
      issue => issue.dismissedAt === null && issue.resolvedAt === null,
    ),
  );
  // Includes `phase === 'ready'` alongside the existing `showWelcome`
  // check so the Home button (SharedModal) can hide the path immediately
  // — synchronously, before Settings' own exit-fade even starts — by
  // setting phase to 'ready' right away, without needing to also flip
  // the (deferred) `showWelcome` setting that controls when WelcomeModal
  // itself mounts. Previously this only reset when `showWelcome` flipped
  // true, which only happened AFTER Settings' entire exit animation
  // finished — so the user briefly saw the fully-drawn path on its own,
  // then watched it visibly vanish, before Welcome finally faded in.
  // `phase` is already 'ready' during every other case this matters
  // (initial boot, and MapScreen's own reset-on-reopen effect below), so
  // this doesn't change behavior anywhere but the Home-button path.
  const startupShowWelcome =
    phase === 'loading' || phase === 'ready' || showWelcome;

  // Initial animation
  const { initialBasePathProgress, settingsEnterStyle, infoEnterStyle } =
    useInitialAnimation({
      showWelcome: startupShowWelcome,
      recenterOpacity,
      originMonitorEnabled,
      resetToOrigin,
      onStartupReady: () => {
        // Fires ~1s after welcome dismisses — surfaces the startup tooltip
        // and begins observing miles changes. Runs before the path reveal
        // finishes so the guidance shows quickly.
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
      onPathRevealComplete: () => {
        // Enable game progress animation only after the base path has
        // finished drawing — avoids the progress marker walking along a
        // half-drawn line for returning users.
        setHasInitialPathRevealed(true);
        setPhase('active');
      },
    });

  // Gate startup guidance to first map open only (no auto-open)
  const autoOpenRef = useRef(false);
  // Info button + tooltip managed in infoStore
  const infoButtonRef = useRef<React.ElementRef<typeof Pressable>>(null);
  const reportedMapReadyTokenRef = useRef<number | null>(null);
  // Ref to the Skia canvas backing the map. `mapReady` used to fire purely
  // off layout math (width/height non-zero), which only proves React
  // committed — not that Skia has actually GPU-painted a frame yet.
  // makeImageSnapshotAsync() is the one Skia API that resolves only once
  // a real frame exists, so we use it to gate the "map is visible" signal
  // that lets the splash screen hide.
  const mapCanvasRef = useCanvasRef();

  // Memoized so its object identity only changes when an actual color
  // value changes (e.g. theme switch) — not on every MapScreen render.
  // MiddleEarthMapSkia is wrapped in React.memo specifically to skip
  // re-rendering on the frequent, unrelated `animatedProgress` state
  // updates that drive checkpoint/trivia activation during the active
  // path's catch-up animation (see that component's memo comment for the
  // full root-cause explanation). An inline object literal here would
  // get a new reference on every MapScreen render regardless, defeating
  // that memo via React's default shallow prop comparison just as
  // completely as not memoizing the component at all.
  const mapLayerColors = useMemo(
    () => ({
      legend: theme.colors.svgLegend,
      titles: theme.colors.svgTitles,
      titlesReduced: theme.colors.svgTitlesReduced,
      trees: theme.colors.svgTrees,
      mountains: theme.colors.svgMountains,
      streets: theme.colors.svgStreets,
      water: theme.colors.svgWater,
      coastline: theme.colors.svgCoastline,
      mapBackground: theme.colors.mapBackground,
    }),
    [
      theme.colors.svgLegend,
      theme.colors.svgTitles,
      theme.colors.svgTitlesReduced,
      theme.colors.svgTrees,
      theme.colors.svgMountains,
      theme.colors.svgStreets,
      theme.colors.svgWater,
      theme.colors.svgCoastline,
      theme.colors.mapBackground,
    ],
  );

  // Removed prevMilesRef; selection is store-driven
  // Observe miles changes moved to infoStore
  // (No extra activation guards; equality-based activation below)
  const { gameProgressValue, animatedProgress } = useGameProgressAnimation(
    miles,
    {
      enabled: gameProgressAnimEnabled,
      extraDeps: [observeMilesChanges],
      revealStartProgress: pathRevealStart,
      activationCycle: progressAnimationCycle,
    },
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
    cancelAnimation(pulse);
    cancelAnimation(shimmer);
    if (isSyncing && !reduceMotionEnabled) {
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
    } else if (reduceMotionEnabled) {
      pulse.value = 0;
      shimmer.value = 0;
    } else {
      pulse.value = withTiming(0, { duration: 400 });
      shimmer.value = withTiming(0, { duration: 200 });
    }
  }, [isSyncing, pulse, reduceMotionEnabled, shimmer]);

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
  const tooltipAnchorRef = useRef<React.ElementRef<typeof Pressable>>(null);
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
    const previouslyShowWelcome = previousShowWelcomeRef.current;
    if (previouslyShowWelcome && !showWelcome) {
      setProgressAnimationCycle(cycle => cycle + 1);
    }
    previousShowWelcomeRef.current = showWelcome;
  }, [showWelcome]);

  useEffect(() => {
    if (showWelcome) {
      setHasInitialPathRevealed(false);
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

  useEffect(() => {
    if (!mapReadyEnabled || !onMapReady) return;
    if (reportedMapReadyTokenRef.current === mapReadyToken) return;
    if (width <= 0 || height <= 0 || mapWidth <= 0 || mapHeight <= 0) return;

    let cancelled = false;

    const confirmPainted = async () => {
      // One frame for the layout-triggered render to commit and the Skia
      // canvas to mount before we can snapshot it.
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
      if (cancelled) return;

      try {
        // makeImageSnapshotAsync() is the one Skia API that resolves only
        // once a real GPU-rendered frame exists — layout dimensions being
        // non-zero only proves React committed, not that anything has
        // actually been painted to the canvas yet. This is what makes
        // "map is visually ready" (and therefore "safe to hide splash")
        // an accurate signal instead of a layout-timing guess.
        await mapCanvasRef.current?.makeImageSnapshotAsync();
      } catch (error) {
        // Never block splash-hide indefinitely on a snapshot failure —
        // fall through and report ready anyway.
        console.warn(
          '[MapScreen] map paint confirmation failed, proceeding anyway:',
          error,
        );
      }
      if (cancelled) return;

      reportedMapReadyTokenRef.current = mapReadyToken;
      onMapReady();
    };

    confirmPainted();

    return () => {
      cancelled = true;
    };
  }, [
    mapReadyEnabled,
    mapReadyToken,
    onMapReady,
    width,
    height,
    mapWidth,
    mapHeight,
    miles,
    colorizeMap,
    reducedMapTitles,
    theme.name,
    mapCanvasRef,
  ]);

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
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, tintOverlayStyle]}
          />
          <Animated.View style={[styles.svgWrapper, animatedStyle]}>
            <MiddleEarthMapSkia
              ref={mapCanvasRef}
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
              layerColors={mapLayerColors}
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
            showActiveTrivia={hasInitialPathRevealed}
            animatedProgress={animatedProgress}
            currentMiles={miles}
            gameProgressValue={gameProgressValue}
            onItemPress={(item, type) => {
              showInfo(item, type);
              openModal();
            }}
          />
          {showFriendProgress && (
            <FriendProgressMarkerLayer
              participants={friendProgressParticipants}
              uniformScale={uniformScale}
              mapOffsetX={mapOffsetX}
              mapOffsetY={mapOffsetY}
              centerX={width / 2}
              centerY={height / 2}
              translateX={translateX}
              translateY={translateY}
              scale={scale}
            />
          )}
        </View>
      </GestureDetector>

      {/* Black bar for notch safe area in landscape */}
      {insets.left > 0 && (
        <View
          style={[
            styles.notchBar,
            styles.notchBarLeft,
            {
              width: insets.left,
              backgroundColor: theme.colors.mapBackgroundInverted,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Top-left stack: total distance + today's steps chip. Rendered as a
          single container so the two chips share the post-welcome enter
          animation and stay flush against the left edge of the screen.
          Uses `startupShowWelcome` (phase-aware) rather than the raw
          `showWelcome` setting so this hides in sync with the path and
          other UI when returning Home from Settings — `showWelcome`
          itself only flips after Settings' entire exit-fade completes,
          which left this chip visible on screen for that whole window. */}
      {(miles > 0 ||
        (!startupShowWelcome &&
          (trackingMode === 'pedometer' || trackingMode === 'dual') &&
          totalSteps > 0)) && (
        <Animated.View
          style={[
            styles.milesContainer,
            {
              top: insets.top + 60,
              left: insets.left - 1,
            },
            settingsEnterStyle,
          ]}
        >
          {miles > 0 && (
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
                useMiles,
              })}
            </Button>
          )}
          {!startupShowWelcome &&
            (trackingMode === 'pedometer' || trackingMode === 'dual') &&
            totalSteps > 0 && (
              <View style={styles.stepsChip}>
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
                  <Animated.Text style={stepCountHighlightStyle}>
                    {totalSteps.toLocaleString()}
                  </Animated.Text>
                  {' steps'}
                </Button>
              </View>
            )}
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
                  accessibilityLabel="View statistics"
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
                  accessibilityLabel="Open settings"
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
            <Animated.View style={settingsEnterStyle}>
              <Button
                onPress={() => {
                  clearStickyInfo();
                  setShowPointLabels(!showPointLabels);
                }}
                variant={showPointLabels ? 'primary' : 'inactive'}
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
                accessibilityState={{ selected: showPointLabels }}
              >
                Labels
              </Button>
            </Animated.View>

            {friendProgressParticipants.length > 0 && (
              <Animated.View style={settingsEnterStyle}>
                <Button
                  onPress={() => {
                    clearStickyInfo();
                    setShowFriendProgress(current => !current);
                  }}
                  variant={showFriendProgress ? 'primary' : 'inactive'}
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
                  accessibilityState={{ selected: showFriendProgress }}
                >
                  Friends
                </Button>
              </Animated.View>
            )}
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
              full screen width, independent of the icon column on the right.
              Uses `startupShowWelcome` (phase-aware), not raw `showWelcome`
              — see the miles/steps chip comment above for why: this had no
              fade of its own, so with the raw setting it stayed fully
              visible on screen through Settings' entire exit-fade window
              when returning Home. */}
          <View style={styles.syncPillSlot} pointerEvents="none">
            {!startupShowWelcome && <SyncIndicator />}
          </View>

          {/* Icon column: recenter on top, + on bottom. */}
          <View style={styles.bottomIconColumn} pointerEvents="box-none">
            {/* Recenter Button */}
            <Animated.View style={[styles.iconColumnItem, recenterButtonStyle]}>
              <IconButton
                icon={
                  <RecenterIcon
                    size={iconSizes.medium}
                    color={theme.colors.mapBackground}
                  />
                }
                accessibilityLabel="Recenter map"
                onPress={() => {
                  clearStickyInfo();
                  handleRecenter();
                }}
                hitSlop={{ top: 8, right: 16, bottom: 8, left: 8 }}
              />
            </Animated.View>

            {/* Add Miles Button — disabled while syncing to avoid racing
                manual edits against in-flight chunk writes. */}
            <Animated.View style={[styles.iconColumnItem, settingsEnterStyle]}>
              <IconButton
                icon={<PlusIcon size={iconSizes.medium} />}
                accessibilityLabel="Add distance"
                onPress={() => {
                  clearStickyInfo();
                  pushModal({ type: 'distance' });
                }}
                hitSlop={{ top: 8, right: 16, bottom: 16, left: 8 }}
                disabled={isSyncing}
              />
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>

      {/* Dev Miles (Developer mode). Uses `startupShowWelcome` for the
          same reason as the sync pill and miles/steps chip above. */}
      {devMode && !startupShowWelcome && (
        <DevView keyboardOffset={keyboardOffset} />
      )}

      {/* Loading overlay - hides map until ready */}
      {phase === 'loading' && (
        <View
          style={[
            styles.loadingOverlay,
            { backgroundColor: theme.colors.mapBackgroundInverted },
          ]}
        />
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
    alignItems: 'flex-start',
    zIndex: 100,
  },
  milesContainer: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  stepsChip: {
    marginTop: spacing.xs,
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
  iconColumnItem: {
    alignSelf: 'flex-end',
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  notchBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
  notchBarLeft: {
    left: 0,
  },
});
