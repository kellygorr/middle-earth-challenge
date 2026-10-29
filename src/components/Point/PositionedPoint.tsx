import React from 'react';
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import Point from './Point';
import { PointType } from '../../types';

interface PositionedPointProps {
  item: PointType;
  // Single active flag for both checkpoint and trivia
  isActive: boolean;
  type: 'checkpoint' | 'trivia';
  baseX: number; // original position on the map in screen coordinates
  baseY: number;
  centerX: number; // center of the screen / map view
  centerY: number;
  translateX: SharedValue<number>; // from useMapGestures
  translateY: SharedValue<number>;
  scale: SharedValue<number>; // from useMapGestures
  showLabel: boolean;
  onPress: () => void;
  anchorRef?: React.Ref<View>;
  // Measured height of a label pill at the current labelSize setting.
  // Provided by PointLayer via a single hidden measurement Button so every
  // point uses the same accurate value without measuring per-instance.
  labelHeight: number;
  opacity?: SharedValue<number>;
  // Forwarded to Point for its UI-thread-only activation pathway — see
  // Point.tsx for why these exist. Optional so PositionedPoint keeps
  // working (falling back to the plain `isActive` prop) if a caller
  // doesn't supply them.
  gameProgressValue?: SharedValue<number>;
  activationProgress?: number;
  goingBackward?: boolean;
  buffer?: number;
  forceActive?: boolean;
}

export default function PositionedPoint({
  item,
  isActive,
  type,
  baseX,
  baseY,
  centerX,
  centerY,
  translateX,
  translateY,
  scale,
  showLabel,
  onPress,
  anchorRef,
  labelHeight,
  opacity,
  gameProgressValue,
  activationProgress,
  goingBackward,
  buffer,
  forceActive,
}: PositionedPointProps) {
  const animatedStyle = useAnimatedStyle(() => {
    // For 'top' labels the label sits above the circle in a column-reverse
    // flex layout, pushing the circle down by its own height. We shift the
    // wrapper up by that measured height so the circle lands exactly on
    // (baseX, baseY) regardless of label-size setting.
    const labelOffset = item.labelPosition === 'top' ? labelHeight : 0;

    // Correctly scale the point relative to the map center
    const x = translateX.value + centerX + (baseX - centerX) * scale.value;
    const y =
      translateY.value +
      centerY +
      (baseY - centerY) * scale.value -
      labelOffset;

    return {
      opacity: opacity?.value ?? 1,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  return (
    <Animated.View ref={anchorRef} style={[styles.wrapper, animatedStyle]}>
      <Point
        x={0}
        y={0}
        name={item.name}
        isActive={!!isActive}
        showLabel={showLabel}
        labelPosition={item.labelPosition}
        labelHeight={labelHeight}
        type={type}
        onPress={onPress}
        gameProgressValue={gameProgressValue}
        activationProgress={activationProgress}
        goingBackward={goingBackward}
        buffer={buffer}
        forceActive={forceActive}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
});
