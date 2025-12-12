// Helper to load SVG as raw string for colorization
// This allows runtime manipulation of the SVG's CSS styles

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

let cachedSvgString: string | null = null;

export async function loadSvgString(): Promise<string> {
  if (cachedSvgString) {
    return cachedSvgString;
  }

  const asset = Asset.fromModule(
    require('../assets/maps/middle-earth-map.svg'),
  );
  await asset.downloadAsync();

  if (asset.localUri) {
    const svgContent = await FileSystem.readAsStringAsync(asset.localUri);
    cachedSvgString = svgContent;
    return svgContent;
  }

  throw new Error('Failed to load SVG');
}

export function addColorsToSvg(
  svgString: string,
  colors: Record<string, string>,
): string {
  // Inject color CSS rules into the SVG's <style> block
  const colorStyles = Object.entries(colors)
    .map(([layer, color]) => `#${layer} path { fill: ${color} !important; }`)
    .join('\n      ');

  return svgString.replace('</style>', `\n      ${colorStyles}\n    </style>`);
}
