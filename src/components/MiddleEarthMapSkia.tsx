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
  BACKGROUND_WHITE_PATH,
  GAME_PATH,
  SVG_WIDTH,
  SVG_HEIGHT,
} from '../data/mapPathData';
import { TITLES_FILL_PATH } from '../data/titlesFillPath';

// Render at 3x resolution for crisp display at max zoom
const RENDER_SCALE = 3;

const DEFAULT_COLOR = '#231f20';

interface MiddleEarthMapSkiaProps {
  width: number;
  height: number;
  colorize?: boolean;
  reducedTitles?: boolean;
  defaultColor?: string;
  gamePathColor?: string;
  gamePathData?: string;
  gamePathInactiveColor?: string;
  zoomScale?: SharedValue<number>;
  journeyProgress?: SharedValue<number>;
  initialPathProgress?: SharedValue<number>;
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
}

export default function MiddleEarthMapSkia({
  width,
  height,
  colorize = false,
  reducedTitles = true,
  defaultColor = DEFAULT_COLOR,
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
