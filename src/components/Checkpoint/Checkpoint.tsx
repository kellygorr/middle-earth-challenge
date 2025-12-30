import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Button from '../Buttons';
import Animated, {
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';

interface CheckpointProps {
  x: number;
  y: number;
  name: string;
  isActive: boolean;
  showLabel: boolean;
  labelPosition?: 'top' | 'right';
  type?: 'checkpoint' | 'trivia';
  onPress?: () => void;
}

export default function Checkpoint({
  name,
  isActive,
  showLabel,
  labelPosition = 'right',
  type = 'checkpoint',
  onPress,
}: CheckpointProps) {
  const theme = useTheme();
  const labelSize = useSettingsStore(state => state.labelSize);

  const color = isActive
    ? theme.colors.checkpointUnlocked
    : theme.colors.checkpointLocked;

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showLabel ? 1 : 0, { duration: 200 }),
  }));

  // Center the 24x24 hitbox on the coordinate for both types
  const centerOffset = 12;

  return (
    <View
      style={[
        styles.container,
        { marginLeft: -centerOffset, marginTop: -centerOffset },
        labelPosition === 'top' ? styles.containerColumn : styles.containerRow,
      ]}
      pointerEvents="box-none"
    >
      {/* Checkpoint circles - will be wrapped with animation later */}
      <TouchableOpacity
        style={styles.circleContainer}
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {type === 'trivia' ? (
          /* Simple filled circle for trivia */
          <View
            style={[
              styles.triviaCircle,
              {
                backgroundColor: isActive
                  ? theme.colors.checkpointUnlocked
                  : theme.colors.pathGrey,
              },
            ]}
          />
        ) : (
          /* Target icon for checkpoints */
          <>
            {/* Outer circle */}
            <View
              style={[
                styles.outerCircle,
                {
                  borderColor: color,
                },
              ]}
            >
              {/* Inner circle */}
              <View
                style={[
                  styles.innerCircle,
                  {
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
          </>
        )}
      </TouchableOpacity>

      {/* Label - only show for checkpoints */}
      {type === 'checkpoint' && (
        <Animated.View
          style={[
            labelPosition === 'top'
              ? styles.nameContainerAbove
              : styles.nameContainerRight,
            labelAnimatedStyle,
          ]}
          pointerEvents={showLabel ? 'auto' : 'none'}
        >
          <Button
            onPress={onPress as any}
            variant="primary"
            size="small"
            isMediumText={labelSize === 'large'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {name}
          </Button>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Offsets applied dynamically based on type to center on coordinates
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerColumn: {
    flexDirection: 'column-reverse', // Label above circle
    alignItems: 'flex-start', // Align to left edge
  },
  circleContainer: {
    // Container for circles that will be animated
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  innerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  triviaCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nameContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nameContainerRight: {
    marginLeft: 6,
  },
  nameContainerAbove: {
    marginBottom: 4,
  },
});
