import React, { useMemo } from 'react';
import { Canvas, Path, Skia, Group } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';

import {
  LEGEND_PATH,
  TREES_PATH,
  MOUNTAINS_PATH,
  COASTLINE_PATH,
  WATER_PATH,
  STREETS_PATH,
  TITLES_PATH,
  GAME_PATH,
  SVG_WIDTH,
  SVG_HEIGHT,
} from '../data/mapPathData';
import { TITLES_FILL_PATH } from '../data/titlesFillPath';

// Render at 3x resolution for crisp display at max zoom
const RENDER_SCALE = 3;

interface MiddleEarthMapSkiaProps {
  width: number;
  height: number;
  colorize?: boolean;
  showTitles?: boolean;
  gamePathColor?: string;
  gamePathData?: string;
  gamePathInactiveColor?: string;
  zoomScale?: SharedValue<number>;
  journeyProgress?: SharedValue<number>;
  initialPathProgress?: SharedValue<number>;
  layerColors?: {
    legend?: string;
    mountains?: string;
    trees?: string;
    water?: string;
    streets?: string;
    coastline?: string;
    titles?: string;
    mapBackground?: string;
  };
}

const DEFAULT_COLOR = '#231f20';

export default function MiddleEarthMapSkia({
  width,
  height,
  colorize = false,
  showTitles = true,
  gamePathColor = 'red',
  gamePathInactiveColor = '#C4B5A0',
  gamePathData = GAME_PATH,
  zoomScale,
  journeyProgress,
  initialPathProgress,
  layerColors = {},
}: MiddleEarthMapSkiaProps) {
  // Canvas dimensions at high resolution
  const canvasWidth = width * RENDER_SCALE;
  const canvasHeight = height * RENDER_SCALE;

  // Compute colors for each layer
  const colors = useMemo(
    () => ({
      legend: colorize ? layerColors.legend || DEFAULT_COLOR : DEFAULT_COLOR,
      mountains: colorize
        ? layerColors.mountains || DEFAULT_COLOR
        : DEFAULT_COLOR,
      trees: colorize ? layerColors.trees || DEFAULT_COLOR : DEFAULT_COLOR,
      water: colorize ? layerColors.water || DEFAULT_COLOR : DEFAULT_COLOR,
      streets: colorize ? layerColors.streets || DEFAULT_COLOR : DEFAULT_COLOR,
      coastline: colorize
        ? layerColors.coastline || DEFAULT_COLOR
        : DEFAULT_COLOR,
      titles: colorize ? layerColors.titles || DEFAULT_COLOR : DEFAULT_COLOR,
      mapBackground: layerColors.mapBackground || DEFAULT_COLOR,
    }),
    [colorize, layerColors],
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
  const titlesStrokePath = useMemo(() => {
    const path = Skia.Path.MakeFromSVGString(TITLES_PATH);
    console.log('Skia titlesStrokePath created:', !!path);
    return path;
  }, []);
  // Fill path for actual titles (much larger path data)
  const titlesFillPath = useMemo(() => {
    const path = Skia.Path.MakeFromSVGString(TITLES_FILL_PATH);
    console.log(
      'Skia titlesFillPath created:',
      !!path,
      'showTitles:',
      showTitles,
    );
    return path;
  }, [showTitles]);
  const gamePath = useMemo(
    () => Skia.Path.MakeFromSVGString(gamePathData),
    [gamePathData],
  );

  // Calculate scale to fit the SVG into the high-res canvas
  const scaleX = canvasWidth / SVG_WIDTH;
  const scaleY = canvasHeight / SVG_HEIGHT;

  // Animated stroke width based on zoom (to keep consistent visual stroke)
  const strokeWidth = useDerivedValue(() => {
    const scale = zoomScale?.value ?? 1;
    return 10 / scale;
  }, [zoomScale]);

  // Base path progress (initial reveal animation) - 0 to 1
  const basePathEnd = useDerivedValue(() => {
    return initialPathProgress?.value ?? 1;
  }, [initialPathProgress]);

  // Journey progress for the colored overlay - 0 to 1
  const journeyPathEnd = useDerivedValue(() => {
    return journeyProgress?.value ?? 0;
  }, [journeyProgress]);

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      <Group transform={[{ scaleX }, { scaleY }]}>
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

        {/* Titles layer - stroke background first, then fill on top */}
        {showTitles && titlesStrokePath && (
          <Path
            path={titlesStrokePath}
            color={colors.mapBackground}
            style="stroke"
            strokeWidth={10}
          />
        )}
        {showTitles && titlesFillPath && (
          <Path path={titlesFillPath} color={colors.titles} style="fill" />
        )}

        {/* Game Path - Base (grey/inactive) with reveal animation */}
        {gamePath && (
          <Path
            path={gamePath}
            color={gamePathInactiveColor}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
            start={0}
            end={basePathEnd}
          />
        )}

        {/* Game Path - Progress (colored) showing journey completion */}
        {gamePath && (
          <Path
            path={gamePath}
            color={gamePathColor}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
            start={0}
            end={journeyPathEnd}
          />
        )}
      </Group>
    </Canvas>
  );
}
