# Middle-earth Map SVG Structure

## Overview

Your `middle-earth-map.svg` is well-organized with semantic group IDs and CSS classes. This document explains the structure and how to apply theme colors.

## SVG Groups (Layers)

The map is organized into the following groups with IDs:

### Geographic Features

- **`coastline`** - Coastlines and major borders
- **`rivers`** - River systems
- **`lakes`** - Lakes and water bodies

### Infrastructure

- **`cities`** - City markers and settlements
- **`bridges`** - Bridge elements
- **`streets`** - Roads and paths
- **`arrows`** - Directional indicators

### Terrain

- **`mountains_and_forests`** - Parent group containing:
  - **`Berge`** - Mountain ranges
  - **`mirkwood`** - Forest areas (Mirkwood specifically)

### Text Labels

- **`display_font`** - Large region labels including:
  - **`GONDOR`**
  - **`RHOVANION`**
  - **`RHUN`**
  - **`ERIADOR`**
  - **`ROHAN`**
- **`other_font`** - Smaller location labels like:
  - **`Esgaroth_upon`**
  - **`Sea_of_Rhûn`**
  - (and many more)

### Other

- **`frame`** - Map border/frame
- **`legend`** - Map legend/key

## Current Styling

All elements currently use black colors:

- **Stroke color**: `#231f20` (near-black)
- **Text fill**: `#231f20` (near-black)
- **Various stroke widths**: 2px - 9px

CSS classes (`cls-1` through `cls-20`) control styling.

## Applying Theme Colors

### Method 1: Using the Theme Mapping Utility

The `src/utils/svgThemeMapping.ts` file provides theme-specific colors for each SVG group:

```typescript
import { getSVGGroupStyles } from '../utils/svgThemeMapping';
import { classicTheme } from '../constants/themes';

const groupStyles = getSVGGroupStyles(classicTheme);
// Returns colors for: frame, coastline, rivers, lakes, cities, etc.
```

### Method 2: Direct Color Application in React Native

When rendering the SVG in React Native with `react-native-svg`, you can:

1. **Parse the SVG** and wrap groups with styled components
2. **Override colors** based on group ID
3. **Apply theme dynamically** based on user settings

Example approach:

```tsx
<G id="rivers">
  <Path stroke={theme.colors.mapRivers} strokeWidth={3} d="M..." />
</G>
```

## Recommended Theme Colors

### Classic Theme (Parchment/Middle-earth aesthetic)

- **Coastline**: `#8B4513` (Saddle brown)
- **Rivers**: `#4682B4` (Steel blue)
- **Mountains**: `#696969` (Dim gray)
- **Forests**: `#556B2F` (Dark olive green)
- **Cities**: `#D4AF37` (Gold)
- **Text**: `#2C1810` (Very dark brown)

### Minimalist Theme (Modern/Clean)

- **Coastline**: `#2C3E50` (Dark blue-gray)
- **Rivers**: `#546E7A` (Blue-gray)
- **Mountains**: `#78909C` (Medium gray)
- **Forests**: `#90A4AE` (Light blue-gray)
- **Cities**: `#2C3E50` (Dark blue-gray)
- **Text**: `#212121` (Almost black)

## Modifying the SVG

### To Change All Black Elements to Theme Colors

You have two options:

#### Option A: Keep Original SVG (Recommended)

- Keep the SVG file as-is with black colors
- Apply colors dynamically in React Native based on active theme
- More flexible for theme switching

#### Option B: Create Theme-Specific SVG Versions

- Export two versions: `middle-earth-map-classic.svg` and `middle-earth-map-minimalist.svg`
- Manually replace colors in each version
- Less flexible but simpler rendering

### To Add Theme-Specific Styling Classes

Add theme-specific CSS to the `<defs><style>` section:

```xml
<style>
  /* Classic theme */
  .theme-classic .coastline-path { stroke: #8B4513; }
  .theme-classic .river-path { stroke: #4682B4; }

  /* Minimalist theme */
  .theme-minimalist .coastline-path { stroke: #2C3E50; }
  .theme-minimalist .river-path { stroke: #546E7A; }
</style>
```

Then add classes to paths:

```xml
<path class="cls-7 coastline-path" d="M1720.42,2044.02c..."/>
```

## Integration with React Native

When you render this SVG in `react-native-svg`, you'll need to:

1. **Import the SVG** as a React component
2. **Extract group elements** by ID
3. **Apply theme colors** to each group's stroke/fill props
4. **Handle dynamic theme switching**

Example structure for the Map component:

```tsx
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../stores/settingsStore';
import { getSVGGroupStyles } from '../utils/svgThemeMapping';

const MiddleEarthMap = () => {
  const theme = useTheme();
  const groupStyles = getSVGGroupStyles(theme);

  // Apply styles to SVG before rendering
  // or use react-native-svg-transformer to import directly
};
```

## SVG Dimensions

- **ViewBox**: `0 0 3174.5 2373.04`
- **Aspect Ratio**: ~4:3
- **File Size**: ~460KB (could be optimized further if needed)

## Next Steps

1. ✅ SVG is already well-organized with group IDs
2. ✅ Theme color mapping utility created
3. ⏳ Create SVG wrapper component in React Native
4. ⏳ Apply theme colors dynamically
5. ⏳ Test theme switching

## Notes

- The SVG uses German labels ("Berge" = Mountains)
- Some location names use special characters (Rhûn)
- The font "Mirza-Medium" is embedded - ensure it's available or use system fonts in React Native
