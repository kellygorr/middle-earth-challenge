const fs = require('fs');
const path = require('path');

// Read the SVG file
const svgPath = path.join(
  __dirname,
  '../src/assets/maps/middle-earth-map-full.svg',
);
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Extract viewBox
const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 3174.5 2373.04';

// Groups to extract (excluding Routes - will handle separately)
const groups = [
  'legend',
  'trees',
  'mountains',
  'coastline',
  'water',
  'streets',
  'titles',
];

// Extract paths for each group
const groupPaths = {};

groups.forEach(groupId => {
  // Find the group in the SVG
  const groupRegex = new RegExp(
    `<g id="${groupId}"[^>]*>([\\s\\S]*?)<\\/g>`,
    'i',
  );
  const groupMatch = svgContent.match(groupRegex);

  if (groupMatch) {
    const groupContent = groupMatch[1];
    // Extract all path elements
    const pathRegex = /<path[^>]*>/g;
    const paths = groupContent.match(pathRegex) || [];

    groupPaths[groupId] = paths.map((pathTag, index) => {
      // Extract id first to identify special paths
      const idMatch = pathTag.match(/id="([^"]*)"/);
      const pathId = idMatch ? idMatch[1] : '';
      const isBackgroundPath = pathId === 'background-white';

      // Extract d attribute - must handle very long path data
      // Use greedy match to get all content until the LAST quote before the closing tag
      const dMatch = pathTag.match(/\sd="([^"]+)"/);
      const classMatch = pathTag.match(/class="([^"]*)"/);
      const strokeMatch = pathTag.match(/stroke="([^"]*)"/);
      const strokeWidthMatch = pathTag.match(/stroke-width="([^"]*)"/);
      const fillMatch = pathTag.match(/fill="([^"]*)"/);

      return {
        index,
        d: dMatch ? dMatch[1] : '',
        class: classMatch ? classMatch[1] : '',
        stroke: strokeMatch ? strokeMatch[1] : null,
        strokeWidth: strokeWidthMatch ? strokeWidthMatch[1] : null,
        fill: fillMatch ? fillMatch[1] : null,
        id: pathId,
        isBackgroundPath: isBackgroundPath,
      };
    });
  }
});

// Generate TypeScript component
const componentCode = `import React, { useMemo } from 'react';
import Svg, { G, Path, SvgProps } from 'react-native-svg';
import Animated, { useAnimatedProps, withTiming } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface MiddleEarthMapSvgProps extends SvgProps {
  colorize?: boolean;
  layerColors?: {
    legend?: string;
    mountains?: string;
    trees?: string;
    water?: string;
    streets?: string;
    coastline?: string;
    titles?: string;
  };
}

const DEFAULT_COLOR = '#231f20';

export default function MiddleEarthMapSvg({
  colorize = false,
  layerColors = {},
  ...props
}: MiddleEarthMapSvgProps) {
  // Compute colors for each layer
  const colors = useMemo(() => ({
    legend: colorize ? (layerColors.legend || DEFAULT_COLOR) : DEFAULT_COLOR,
    mountains: colorize ? (layerColors.mountains || DEFAULT_COLOR) : DEFAULT_COLOR,
    trees: colorize ? (layerColors.trees || DEFAULT_COLOR) : DEFAULT_COLOR,
    water: colorize ? (layerColors.water || DEFAULT_COLOR) : DEFAULT_COLOR,
    streets: colorize ? (layerColors.streets || DEFAULT_COLOR) : DEFAULT_COLOR,
    coastline: colorize ? (layerColors.coastline || DEFAULT_COLOR) : DEFAULT_COLOR,
    titles: colorize ? (layerColors.titles || DEFAULT_COLOR) : DEFAULT_COLOR,
  }), [colorize, layerColors]);

  return (
    <Svg viewBox="${viewBox}" {...props}>
${groups
  .map(groupId => {
    const paths = groupPaths[groupId] || [];
    if (paths.length === 0) return '';

    return `      {/* ${groupId} group - ${paths.length} paths */}
      <G id="${groupId}">
${paths
  .map(path => {
    const hasStroke = path.stroke !== null;
    const hasExplicitFill = path.fill !== null;

    // Build the path props
    let pathProps = `          d="${path.d}"`;

    if (hasStroke) {
      pathProps += `\n          stroke="${path.stroke}"`;
    }
    if (path.strokeWidth) {
      pathProps += `\n          strokeWidth={${path.strokeWidth}}`;
    }

    // Special handling for background-white path - use animated map background color as stroke
    if (path.isBackgroundPath) {
      return `        <AnimatedPath
${pathProps}
          stroke={colors.mapBackground}
          strokeWidth={10}
          fill="none"
        />`;
    }

    // For paths with explicit fill, keep it; otherwise use animated color
    if (hasExplicitFill) {
      return `        <Path
${pathProps}
          fill="${path.fill}"
        />`;
    } else {
      return `        <AnimatedPath
${pathProps}
          fill={colors.${groupId}}
        />`;
    }
  })
  .join('\n')}
      </G>`;
  })
  .join('\n')}
    </Svg>
  );
}
`;

// Write the generated component
const outputPath = path.join(
  __dirname,
  '../src/components/MiddleEarthMapSvg.tsx',
);
fs.writeFileSync(outputPath, componentCode, 'utf8');

console.log('✅ Successfully generated MiddleEarthMapSvg.tsx');
console.log(`   Total groups: ${groups.length}`);
groups.forEach(groupId => {
  const count = groupPaths[groupId]?.length || 0;
  console.log(`   - ${groupId}: ${count} paths`);
});
