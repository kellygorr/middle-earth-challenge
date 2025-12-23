import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Animated, {
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { typography } from '../../styles/typography';

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
    >
      {/* Checkpoint circles - will be wrapped with animation later */}
      <TouchableOpacity
        style={styles.circleContainer}
        onPress={onPress}
        activeOpacity={0.7}
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
            styles.nameContainer,
            labelPosition === 'top'
              ? styles.nameContainerAbove
              : styles.nameContainerRight,
            {
              backgroundColor: theme.colors.checkpointTextBackground,
            },
            labelAnimatedStyle,
          ]}
        >
          <Text
            style={[
              labelSize === 'large' ? typography.labelLarge : typography.label,
              {
                color: theme.colors.checkpointLabel,
              },
            ]}
          >
            {name}
          </Text>
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
