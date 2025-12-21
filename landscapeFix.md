# Landscape Mode Fix — Final Summary

## What was broken

When rotating to landscape:

- The map looked squished (aspect ratio distortion).
- Checkpoints no longer lined up with the map.
- Rotation could reset or destabilize pan/zoom.

## Root causes

### 1) Non-uniform SVG scaling (squishing)

The SVG was effectively being scaled with different X/Y factors in landscape, so the map’s aspect ratio changed.

**Fix:** use a _single_ `uniformScale` for both axes so the SVG keeps its aspect ratio.

### 2) Dimensions not reactive on rotation

Some layout math relied on dimensions that could be stale after rotation.

**Fix:** drive layout from reactive dimensions (via a hook) so width/height update immediately when the device rotates.

### 3) Hi-res canvas rendering introduced an origin/scale mismatch

To keep the map crisp while zoomed, the Skia canvas is rendered at a higher internal resolution (`RENDER_SCALE`) and then scaled down for display. That can affect perceived positioning unless the wrapper transform behaves consistently.

**Fix:** ensure the wrapper uses a stable transform origin (top-left) so scaling doesn’t “shift” the canvas.

### 4) Path stroke width got too thin after hi-res rendering

Because the canvas is rendered larger and then scaled down, strokes also appear thinner unless compensated.

**Fix:** multiply the stroke width by `RENDER_SCALE` in canvas-space.

Example:

```ts
// canvas-space stroke width
strokeWidth = (baseStroke * RENDER_SCALE) / (zoom * uniformScale);
```

## Key implementation notes

- Map + checkpoints alignment depends on _sharing the same world→screen transform math_ (uniform scale + consistent offsets).
- Rotation should preserve the current zoom/position and clamp to new bounds, rather than resetting state.

## Where this lives

- Map scaling + offsets + checkpoint positioning: [src/screens/MapScreen.tsx](src/screens/MapScreen.tsx)
- Skia render scale + transform origin + stroke width compensation: [src/components/MiddleEarthMapSkia.tsx](src/components/MiddleEarthMapSkia.tsx)
- Gesture state preservation / clamping on rotation: [src/hooks/useMapGestures.ts](src/hooks/useMapGestures.ts)
- Reactive dimension updates: [src/hooks/useReactiveDimensions.ts](src/hooks/useReactiveDimensions.ts)
