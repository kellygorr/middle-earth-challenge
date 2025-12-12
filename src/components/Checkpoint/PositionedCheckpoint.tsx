import React from 'react';
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import Checkpoint from './Checkpoint';
import { Checkpoint as CheckpointType } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

interface PositionedCheckpointProps {
  checkpoint: CheckpointType;
  baseX: number;
  baseY: number;
  centerX: number;
  centerY: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  showLabel: boolean;
  onPress: () => void;
}

export default function PositionedCheckpoint({
  checkpoint,
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
  
  // Adjust Y position when label is on top to compensate for label height
  const LABEL_HEIGHT_REGULAR = 24; // Approximate height of regular label (font + padding + margin)
  const LABEL_HEIGHT_LARGE = 28; // Approximate height of large label
  const labelHeight = labelSize === 'large' ? LABEL_HEIGHT_LARGE : LABEL_HEIGHT_REGULAR;
  
  const adjustedBaseY =
    showLabel && checkpoint.labelPosition === 'top'
      ? baseY - labelHeight
      : baseY;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          translateX.value + centerX + (baseX - centerX) * scale.value,
      },
      {
        translateY:
          translateY.value + centerY + (adjustedBaseY - centerY) * scale.value,
      },
    ],
  }));

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <Checkpoint
        x={0}
        y={0}
        name={checkpoint.name}
        isActive={checkpoint.isActive || false}
        showLabel={showLabel}
        labelPosition={checkpoint.labelPosition}
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
