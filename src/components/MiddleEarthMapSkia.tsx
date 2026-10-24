import React, { useMemo } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  Group,
  LinearGradient,
  Fill,
  vec,
  CanvasRef,
} from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';

import {
  LEGEND_PATH,
  TREES_PATH,
  MOUNTAINS_PATH,
  COASTLINE_PATH,
  WATER_PATH,
  STREETS_PATH,
  BACKGROUND_WHITE_PATH,
  GAME_PATH,
  SVG_WIDTH,
  TITLES_FILL_PATH,
} from '../constants/mapPathData';

// Render at 2x resolution for crisp display when zoomed
const RENDER_SCALE = 2;

const DEFAULT_COLOR = '#231f20';

interface MiddleEarthMapSkiaProps {
  width: number;
  height: number;
  colorize?: boolean;
  reducedTitles?: boolean;
  defaultColor?: string;
  activePathColor?: string;
  /**
   * Optional 0..1 progress driving a traveling highlight ("shimmer") that
   * runs along the path. When provided, a small bright segment slides
   * down the path; pair with a useSharedValue + withRepeat loop.
   */
  shimmerProgress?: SharedValue<number>;
  gamePathData?: string;
  inactivePathColor?: string;
  zoomScale?: SharedValue<number>;
  gameProgress?: SharedValue<number>;
  initialBasePathProgress?: SharedValue<number>;
  layerColors?: {
    legend?: string;
    titles?: string;
    titlesReduced?: string;
    trees?: string;
    mountains?: string;
    streets?: string;
    water?: string;
    coastline?: string;
    mapBackground?: string;
  };
  /**
   * Ref to the underlying Skia Canvas. Callers can use
   * `ref.current.makeImageSnapshotAsync()` to get a real signal that a
   * frame has actually been GPU-painted — layout dimensions being
   * non-zero only means React committed, not that Skia has drawn
   * anything yet.
   */
  ref?: React.Ref<CanvasRef>;
}

function MiddleEarthMapSkia({
  width,
  height,
  colorize = false,
  reducedTitles = true,
  defaultColor = DEFAULT_COLOR,
  activePathColor = 'red',
  shimmerProgress,
  inactivePathColor = '#C4B5A0',
  gamePathData = GAME_PATH,
  zoomScale,
  gameProgress,
  initialBasePathProgress,
  layerColors = {},
  ref,
}: MiddleEarthMapSkiaProps) {
  // Render canvas at higher resolution, display at original size
  const canvasWidth = width * RENDER_SCALE;
  const canvasHeight = height * RENDER_SCALE;

  // Determine titles color based on reducedTitles setting
  const titlesColor = useMemo(() => {
    if (reducedTitles) {
      return layerColors.titlesReduced || 'rgba(0, 0, 0, 0.3)';
    }
    return colorize ? layerColors.titles || defaultColor : defaultColor;
  }, [
    reducedTitles,
    colorize,
    layerColors.titles,
    layerColors.titlesReduced,
    defaultColor,
  ]);

  // Compute colors for each layer
  const colors = useMemo(
    () => ({
      legend: colorize ? layerColors.legend || defaultColor : defaultColor,
      mountains: colorize
        ? layerColors.mountains || defaultColor
        : defaultColor,
      trees: colorize ? layerColors.trees || defaultColor : defaultColor,
      water: colorize ? layerColors.water || defaultColor : defaultColor,
      streets: colorize ? layerColors.streets || defaultColor : defaultColor,
      coastline: colorize
        ? layerColors.coastline || defaultColor
        : defaultColor,
      titles: titlesColor,
      mapBackground: layerColors.mapBackground || defaultColor,
    }),
    [colorize, layerColors, defaultColor, titlesColor],
  );

  // Create Skia path objects (memoized)
  const legendPath = useMemo(
    () => Skia.Path.MakeFromSVGString(LEGEND_PATH),
    [],
  );
  const treesPath = useMemo(() => Skia.Path.MakeFromSVGString(TREES_PATH), []);
  const mountainsPath = useMemo(
    () => Skia.Path.MakeFromSVGString(MOUNTAINS_PATH),
    [],
  );
  const coastlinePath = useMemo(
    () => Skia.Path.MakeFromSVGString(COASTLINE_PATH),
    [],
  );
  const waterPath = useMemo(() => Skia.Path.MakeFromSVGString(WATER_PATH), []);
  const streetsPath = useMemo(
    () => Skia.Path.MakeFromSVGString(STREETS_PATH),
    [],
  );
  // Stroke path for title outlines (background)
  const titlesBackgroundPath = useMemo(
    () => Skia.Path.MakeFromSVGString(BACKGROUND_WHITE_PATH),
    [],
  );
  // Fill path for actual titles (much larger path data)
  const titlesFillPath = useMemo(
    () => Skia.Path.MakeFromSVGString(TITLES_FILL_PATH),
    [],
  );
  const gamePath = useMemo(
    () => Skia.Path.MakeFromSVGString(gamePathData),
    [gamePathData],
  );

  // Calculate uniform scale to fit the SVG (caller passes uniformly-scaled dimensions)
  const uniformScale = canvasWidth / SVG_WIDTH;

  // Animated stroke width based on zoom AND uniform scale (to keep consistent visual stroke)
  // Multiply by RENDER_SCALE since canvas is larger but scaled down for display
  const strokeWidth = useDerivedValue(() => {
    const zoom = zoomScale?.value ?? 1;
    return (5 * RENDER_SCALE) / (zoom * uniformScale);
  }, [zoomScale, uniformScale]);

  // Base path progress (initial reveal animation) - 0 to 1
  const basePathEnd = useDerivedValue(() => {
    return initialBasePathProgress?.value ?? 1;
  }, [initialBasePathProgress]);

  // Shimmer window on the path — a small bright segment travels from start
  // to end as `shimmerProgress` goes 0→1, clipped to the revealed base.
  // Sized to ~50 screen pixels regardless of zoom/scale.
  const SHIMMER_SCREEN_PX = 50;
  const shimmerSvgUnits = SHIMMER_SCREEN_PX * (SVG_WIDTH / width);
  const gamePathLength = useMemo(() => {
    if (!gamePath) return 1;
    const iter = Skia.ContourMeasureIter(gamePath, false, 1);
    let total = 0;
    let measure = iter.next();
    while (measure) {
      total += measure.length();
      measure = iter.next();
    }
    return total || 1;
  }, [gamePath]);
  const SHIMMER_WINDOW = Math.min(0.5, shimmerSvgUnits / gamePathLength);
  const shimmerStart = useDerivedValue(() => {
    const t = shimmerProgress?.value ?? 0;
    const reveal = basePathEnd.value;
    return Math.max(0, Math.min(t - SHIMMER_WINDOW, reveal));
  }, [shimmerProgress, basePathEnd]);
  const shimmerEnd = useDerivedValue(() => {
    const t = shimmerProgress?.value ?? 0;
    const reveal = basePathEnd.value;
    return Math.max(0, Math.min(t, reveal));
  }, [shimmerProgress, basePathEnd]);
  const shimmerStrokeWidth = useDerivedValue(
    () => strokeWidth.value * 1.6,
    [strokeWidth],
  );

  // Zoom-aware forward adjustment: push end slightly when zoomed in.
  //
  // Reads `initialBasePathProgress` directly (the raw shared value), not
  // `basePathEnd.value` (the derived value wrapping it), even though they
  // hold the same number. A derived value that reads another derived
  // value while both are changing in the same animation frame is a
  // confirmed upstream Reanimated+Skia hazard (react-native-skia issues
  // #4097 and #4243: a derived prop's native recorder can capture a stale
  // intermediate value one frame behind a raw shared-value read in the
  // same commit). That derived-on-derived shape is exactly what caused
  // this path's animation to read as jagged/choppy next to the grey base
  // path, which only ever reads one raw shared value
  // (`initialBasePathProgress`) directly — never another derived value —
  // and stayed smooth. Flattening this chain removes the hazard without
  // changing the clamp's math: `basePathEnd.value` was always exactly
  // `initialBasePathProgress?.value ?? 1`.
  const gameProgressAdjusted = useDerivedValue(() => {
    const base = gameProgress?.value ?? 0;
    const zoom = zoomScale?.value ?? 1;
    const K = 0.004; // tuning constant
    const delta = zoom > 1 ? (K * (zoom - 1)) / zoom : 0; // 0 at normal zoom
    const reveal = initialBasePathProgress?.value ?? 1;
    return Math.max(0, Math.min(base + delta, reveal, 1));
  }, [gameProgress, zoomScale, initialBasePathProgress]);

  const containerStyle = useMemo(
    () => ({ width, height, overflow: 'hidden' as const }),
    [width, height],
  );
  const canvasStyle = useMemo(() => {
    const s = 1 / RENDER_SCALE;
    const offsetX = -(canvasWidth * (1 - s)) / 2;
    const offsetY = -(canvasHeight * (1 - s)) / 2;
    return {
      width: canvasWidth,
      height: canvasHeight,
      transform: [
        { translateX: offsetX },
        { translateY: offsetY },
        { scale: s },
      ],
    };
  }, [canvasWidth, canvasHeight]);

  return (
    <View style={containerStyle}>
      <Canvas ref={ref} style={canvasStyle}>
        {/* Full-canvas background fill. Kept even with the canvas
            non-opaque (see below) as cheap insurance against any gap in
            the map artwork ever showing transparency instead of a solid
            backdrop.

            NOTE: opaque={true} was tried here to silence recurring
            (Skia-labeled "safe to ignore") `updateTexImage:
            LegacySurfaceTexture is not attached!` / `RNSkia
            updateAndRelease() failed` warnings during the map's path-fill
            animations. That FAILED — those warnings turned out to be
            unrelated to the actual visible choppiness (root-caused
            separately, see useGameProgressAnimation.ts's duration-scaling
            fix) — and opaque introduced a real regression: on Android,
            opaque backs the canvas with a SurfaceView instead of a
            SurfaceTexture-backed TextureView. SurfaceView is composited
            as a separate hardware layer outside the normal view
            hierarchy and does not blend correctly under a translucent,
            animating overlay — so the welcome modal's fade-out punched
            through to solid black instead of smoothly revealing the map
            underneath. Do not set opaque on this Canvas again without
            re-verifying the welcome-dismiss fade-out on a real Android
            device first.
        */}
        <Fill color={colors.mapBackground} />
        <Group transform={[{ scale: uniformScale }]}>
          {/* Legend layer */}
          {legendPath && (
            <Path path={legendPath} color={colors.legend} style="fill" />
          )}

          {/* Trees layer */}
          {treesPath && (
            <Path path={treesPath} color={colors.trees} style="fill" />
          )}

          {/* Mountains layer */}
          {mountainsPath && (
            <Path path={mountainsPath} color={colors.mountains} style="fill" />
          )}

          {/* Coastline layer */}
          {coastlinePath && (
            <Path path={coastlinePath} color={colors.coastline} style="fill" />
          )}

          {/* Water layer */}
          {waterPath && (
            <Path path={waterPath} color={colors.water} style="fill" />
          )}

          {/* Streets layer */}
          {streetsPath && (
            <Path path={streetsPath} color={colors.streets} style="fill" />
          )}

          {/* Titles layer - background fill first, then title fill on top */}
          {titlesBackgroundPath && (
            <Path
              path={titlesBackgroundPath}
              color={colors.mapBackground}
              style="fill"
            />
          )}
          {titlesFillPath && (
            <Path path={titlesFillPath} color={colors.titles} style="fill" />
          )}

          {/* Game Path - Base (grey/inactive) with reveal animation */}
          {gamePath && (
            <Path
              path={gamePath}
              color={inactivePathColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="butt"
              strokeJoin="round"
              start={0}
              end={basePathEnd}
            />
          )}

          {/* Game Path - Progress (colored) showing journey completion */}
          {gamePath && (
            <Path
              path={gamePath}
              color={activePathColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="butt"
              strokeJoin="round"
              start={0}
              end={gameProgressAdjusted}
            />
          )}

          {/* Sync shimmer: a bright highlight that travels along the path.
              The stroke is painted with a tight LinearGradient so the
              shimmer itself shows a sweep of colors at any given moment
              (white→cream→gold→sky→white), not just one solid color. */}
          {gamePath && shimmerProgress && (
            <Group opacity={0.5}>
              <Path
                path={gamePath}
                style="stroke"
                strokeWidth={shimmerStrokeWidth}
                strokeCap="round"
                strokeJoin="round"
                start={shimmerStart}
                end={shimmerEnd}
              >
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(shimmerSvgUnits, shimmerSvgUnits)}
                  colors={[
                    '#FFFFFF',
                    '#FFE9A8',
                    '#FFD24A',
                    '#D8D5CE',
                    '#FFFFFF',
                  ]}
                  mode="mirror"
                />
              </Path>
            </Group>
          )}
        </Group>
      </Canvas>
    </View>
  );
}

// Memoized to isolate this component from MapScreen's own state churn.
//
// MapScreen re-renders at ~10Hz while the yellow/active journey path
// animates — `useGameProgressAnimation`'s `animatedProgress` JS state
// (bridged from the UI thread, throttled but still a real React state
// update) drives checkpoint/trivia activation logic and is deliberately
// NOT something this component's own visuals depend on: every value that
// actually needs to track the animation frame-by-frame (`gameProgress`,
// `initialBasePathProgress`, `zoomScale`, `shimmerProgress`) is a shared
// value read directly by Reanimated/Skia on the UI thread, independent of
// React re-renders entirely.
//
// Without memoization, each of those ~10 re-renders/sec still reconciles
// this entire `<Canvas>` subtree, which forces Skia's JS-thread scene-graph
// "recording" pass to re-run (a real, measurable cost — react-native-skia
// issue #4243 documents every Canvas commit recording twice on the JS
// thread) even though none of this component's own props changed. That
// JS-thread recording work competes with the UI thread for the same
// frame budget the stroke-trim animation needs, which is the likely
// source of the reported jank: the grey/base path reveal never triggers
// any JS state change at all (confirmed smooth), while the yellow/active
// path's reveal is the only one paired with a recurring React re-render
// of its own renderer.
//
// This relies on every prop below being reference-stable across those
// unrelated re-renders — in particular, `layerColors` at the MapScreen
// call site must be memoized (not an inline object literal), or its new
// object identity on every render would defeat this memo via React's
// default shallow prop comparison exactly as effectively as not
// memoizing at all.
export default React.memo(MiddleEarthMapSkia);
