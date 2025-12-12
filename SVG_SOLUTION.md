# Middle-earth Map SVG Solution

## The Problem

Your `middle-earth-map.svg` is **1.8MB with 3,783 lines** and thousands of `<path>` elements. React Native's `react-native-svg` library must:

- Parse 1.8MB of XML in JavaScript
- Create thousands of individual native components (one per path/shape)
- This overwhelms the parser and causes crashes/hot-reload issues

## Working Solutions

### Option 1: Manual SVG Simplification (RECOMMENDED for quality)

**What to do:**

```bash
# 1. Open the SVG in a vector editor
open src/assets/maps/middle-earth-map.svg
# (Use Illustrator, Inkscape, or Figma)

# 2. In Illustrator:
# - Select All (Cmd+A)
# - Object → Path → Simplify
#   - Curve Precision: 50-75%
#   - Angle Threshold: 10-20°
# - Check "Reduce Points"
# - Object → Path → Clean Up
#   - Check all options

# 3. Merge similar paths:
# - Select paths of same color
# - Object → Compound Path → Make
# - Or Pathfinder → Unite

# 4. Remove tiny details:
# - Zoom in and delete small islands
# - Simplify intricate coastlines
# - Remove decorative elements if needed

# 5. Save optimized version
# File → Save As → middle-earth-map-simple.svg
```

**Target:** <500KB file, <1000 path elements

**Then use it:**

```tsx
import MapSvg from '../assets/maps/middle-earth-map-simple.svg';

<MapSvg width={width} height={height} />;
```

### Option 2: Convert to High-Res PNG (EASIEST, works now)

**Pros:** Guaranteed to work, simple implementation, good performance
**Cons:** Larger file (~2-3MB), loses infinite zoom quality

```bash
# Using online tool or ImageMagick
# Export SVG to PNG at 3x size for retina displays
convert src/assets/maps/middle-earth-map.svg -resize 9522x7119 src/assets/maps/middle-earth-map@3x.png

# Or use online: https://svgtopng.com/
```

**Use it:**

```tsx
import { Image } from 'react-native';

<Image
  source={require('../assets/maps/middle-earth-map@3x.png')}
  style={{ width, height }}
  resizeMode="contain"
/>;
```

**Add zoom with react-native-reanimated:**

```bash
# Already installed
```

```tsx
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const scale = useSharedValue(1);
const pinch = Gesture.Pinch().onUpdate(e => {
  scale.value = e.scale;
});

<GestureDetector gesture={pinch}>
  <Animated.Image
    source={require('../assets/maps/middle-earth-map@3x.png')}
    style={[
      { width, height },
      useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
      })),
    ]}
  />
</GestureDetector>;
```

### Option 3: WebView (requires native rebuild)

**Pros:** Browsers handle complex SVGs better, native zoom
**Cons:** Requires rebuild, performance overhead

```bash
# 1. Install
npm install react-native-webview

# 2. Rebuild app (REQUIRED)
cd android && ./gradlew clean
cd ..
npx react-native run-android

# 3. Copy SVG to assets
mkdir -p android/app/src/main/assets/maps
cp src/assets/maps/middle-earth-map-optimized.svg android/app/src/main/assets/maps/middle-earth-map.svg
```

**Use it:**

```tsx
import { WebView } from 'react-native-webview';

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <style>
    body { margin: 0; background: #1a1a1a; }
    svg { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    fetch('file:///android_asset/maps/middle-earth-map.svg')
      .then(r => r.text())
      .then(svg => document.getElementById('map').innerHTML = svg);
  </script>
</body>
</html>
`;

<WebView source={{ html }} style={{ flex: 1 }} />;
```

## Current Status

The app is running with a **placeholder** showing these options. Choose one approach and implement it.

## Recommendation

**Start with Option 2 (PNG)** to get the app working quickly, then optionally move to Option 1 (simplified SVG) later if you want vector zoom quality.
