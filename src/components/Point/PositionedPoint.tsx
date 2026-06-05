import React from 'react';
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import Point from './Point';
import { PointType } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

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
  anchorRef?: React.Ref<any>;
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
}: PositionedPointProps) {
  const labelSize = useSettingsStore(state => state.labelSize);

  const LABEL_HEIGHT_SMALL = 20;
  const LABEL_HEIGHT_MEDIUM = 26;
  const LABEL_HEIGHT_LARGE = 30;
  const labelHeight =
    labelSize === 'large'
      ? LABEL_HEIGHT_LARGE
      : labelSize === 'small'
      ? LABEL_HEIGHT_SMALL
      : LABEL_HEIGHT_MEDIUM;

  const animatedStyle = useAnimatedStyle(() => {
    const labelOffset = item.labelPosition === 'top' ? labelHeight : 0;

    // Correctly scale the point relative to the map center
    const x = translateX.value + centerX + (baseX - centerX) * scale.value;
    const y =
      translateY.value +
      centerY +
      (baseY - centerY) * scale.value -
      labelOffset;

    return {
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  return (
    <Animated.View
      ref={anchorRef as any}
      style={[styles.wrapper, animatedStyle]}
    >
      <Point
        x={0}
        y={0}
        name={item.name}
        isActive={!!isActive}
        showLabel={showLabel}
        labelPosition={item.labelPosition}
        type={type}
        onPress={onPress}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
});
