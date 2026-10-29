import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import PositionedPoint from './PositionedPoint';
import Button, { labelSizeToButtonSize } from '../Buttons';
import { mapBookMilesToPathProgress } from '../../utils/pathProgress';
import { PointType } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { motion } from '../../styles/motion';

// Default label height used until the hidden measurement Button reports its
// actual height on first layout. Matches the medium size to minimize the
// visible offset jump when a fresh map appears.
const DEFAULT_LABEL_HEIGHT = 26;

const noop = () => {};

type Props = {
  checkpoints: PointType[];
  trivia: PointType[];
  uniformScale: number;
  mapOffsetX: number;
  mapOffsetY: number;
  centerX: number;
  centerY: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  showPointLabels: boolean;
  showActiveTrivia: boolean;
  animatedProgress: number;
  currentMiles: number;
  onItemPress: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  /**
   * The map's raw animated progress shared value. Passed through to each
   * Point so its activation color transition can be computed and reacted
   * to entirely on the UI thread — see Point.tsx. `animatedProgress`
   * (above) remains the throttled JS-bridged copy, still used here for
   * the trivia pre-reveal hide gate and accessibility-label freshness,
   * neither of which needs frame-perfect timing.
   */
  gameProgressValue?: SharedValue<number>;
};

export default function PointLayer({
  checkpoints,
  trivia,
  uniformScale,
  mapOffsetX,
  mapOffsetY,
  centerX,
  centerY,
  translateX,
  translateY,
  scale,
  showPointLabels,
  showActiveTrivia,
  animatedProgress,
  currentMiles,
  onItemPress,
  gameProgressValue,
}: Props) {
  const labelSize = useSettingsStore(state => state.labelSize);
  const reduceMotionEnabled = useReduceMotion();
  const activeTriviaOpacity = useSharedValue(showActiveTrivia ? 1 : 0);

  useEffect(() => {
    cancelAnimation(activeTriviaOpacity);
    activeTriviaOpacity.value =
      showActiveTrivia && !reduceMotionEnabled
        ? withTiming(1, { duration: motion.button.enterDuration })
        : showActiveTrivia
        ? 1
        : 0;
  }, [activeTriviaOpacity, reduceMotionEnabled, showActiveTrivia]);

  // A single hidden Button, rendered with the exact same size / textSize as
  // real point labels, reports its measured height once. Every PositionedPoint
  // uses that height to offset the node so growing/shrinking labels don't
  // shift the circle off its map coordinate. `key={labelSize}` remounts the
  // measurement Button whenever the user changes the label-size setting so
  // we always have an up-to-date measurement.
  const [labelHeight, setLabelHeight] = useState<number>(DEFAULT_LABEL_HEIGHT);
  const buttonSize = labelSizeToButtonSize(labelSize);

  // Only enrich checkpoints with index; trivia passes through unchanged.
  const renderPoint = (
    item: PointType,
    kind: 'checkpoint' | 'trivia',
    index?: number,
  ) => {
    const baseX = item.x * uniformScale - mapOffsetX;
    const baseY = item.y * uniformScale - mapOffsetY;

    const activationProgress = mapBookMilesToPathProgress(
      item.CUMULATIVE_MILES ?? 0,
    );
    // Forward: activate ~8 miles before path reaches point (0.007)
    // Backward: deactivate ~8 miles before path reaches point (0.007)
    const pointMiles = item.CUMULATIVE_MILES ?? 0;
    const goingBackward = currentMiles < pointMiles;
    const buffer = Math.abs(currentMiles - pointMiles) > 20 ? 0.007 : 1e-6;
    const forceActive = kind === 'checkpoint' && !!item.isStart;
    // Still computed in JS from the throttled `animatedProgress` bridge —
    // used ONLY for the trivia pre-reveal hide gate just below and for
    // Point's accessibility label / initial-render color seed, neither of
    // which needs per-frame accuracy. The actual visual color transition
    // no longer depends on this value at all when gameProgressValue is
    // supplied (see Point.tsx).
    const isActive =
      forceActive ||
      (goingBackward
        ? animatedProgress >= activationProgress + buffer
        : animatedProgress + buffer >= activationProgress);

    if (kind === 'trivia' && isActive && !showActiveTrivia) return null;

    const enriched: PointType = { ...item, index };

    return (
      <PositionedPoint
        key={`${kind}:${item.name}`}
        item={enriched}
        isActive={isActive}
        type={kind}
        baseX={baseX}
        baseY={baseY}
        centerX={centerX}
        centerY={centerY}
        translateX={translateX}
        translateY={translateY}
        scale={scale}
        showLabel={kind === 'checkpoint' && showPointLabels}
        onPress={() => onItemPress(enriched, kind)}
        labelHeight={labelHeight}
        opacity={
          kind === 'trivia' && isActive ? activeTriviaOpacity : undefined
        }
        gameProgressValue={gameProgressValue}
        activationProgress={activationProgress}
        goingBackward={goingBackward}
        buffer={buffer}
        forceActive={forceActive}
      />
    );
  };

  return (
    <>
      {trivia.map(tr => renderPoint(tr, 'trivia'))}
      {checkpoints.map((cp, i) => renderPoint(cp, 'checkpoint', i))}
      {/* Hidden measurement label. Off-screen and non-interactive; its only
          job is to report the pill's rendered height for the current
          labelSize so PositionedPoint can compensate for it. */}
      <View
        style={styles.measure}
        pointerEvents="none"
        aria-hidden
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== labelHeight) setLabelHeight(h);
        }}
      >
        <Button
          key={labelSize}
          variant="primary"
          type="label"
          size={buttonSize}
          textSize={buttonSize}
          isLabelButton
          onPress={noop}
        >
          {'A'}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  measure: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
});
