import React from 'react';
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import Checkpoint from './Checkpoint';
import { CheckpointType } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

interface PositionedCheckpointProps {
  item: CheckpointType;
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
}

export default function PositionedCheckpoint({
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
}: PositionedCheckpointProps) {
  const labelSize = useSettingsStore(state => state.labelSize);

  const LABEL_HEIGHT_REGULAR = 24;
  const LABEL_HEIGHT_LARGE = 28;
  const labelHeight =
    labelSize === 'large' ? LABEL_HEIGHT_LARGE : LABEL_HEIGHT_REGULAR;

  const animatedStyle = useAnimatedStyle(() => {
    const labelOffset = item.labelPosition === 'top' ? labelHeight : 0;

    // Correctly scale the checkpoint relative to the map center
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
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <Checkpoint
        x={0}
        y={0}
        name={item.name}
        isActive={isActive}
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
