import React from 'react';
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import Checkpoint from './Checkpoint';

interface PositionedCheckpointProps {
  checkpoint: {
    id: number;
    name: string;
    isActive?: boolean;
  };
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
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          translateX.value + centerX + (baseX - centerX) * scale.value,
      },
      {
        translateY:
          translateY.value + centerY + (baseY - centerY) * scale.value,
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
