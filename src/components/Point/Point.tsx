import React, { useEffect, memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Button from '../Buttons';
import Animated, {
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';

interface PointProps {
  x: number;
  y: number;
  name: string;
  // Single active flag for both checkpoint outline and inner fill, and for trivia
  isActive: boolean;
  showLabel: boolean;
  labelPosition?: 'top' | 'right';
  type?: 'checkpoint' | 'trivia';
  onPress?: () => void;
}

function Point({
  name,
  isActive,
  showLabel,
  labelPosition = 'right',
  type = 'checkpoint',
  onPress,
}: PointProps) {
  const theme = useTheme();
  const labelSize = useSettingsStore(state => state.labelSize);

  // Color transitions handled via animated styles

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showLabel ? 1 : 0, { duration: 200 }),
  }));
  // Activation animation progress for checkpoint color transitions
  const activationSV = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    activationSV.value = withTiming(isActive ? 1 : 0, { duration: 100 });
  }, [isActive, activationSV]);

  // Derive the active color once and reuse in both styles
  const activeColorDV = useDerivedValue(() =>
    interpolateColor(
      activationSV.value,
      [0, 1],
      [
        type === 'checkpoint'
          ? theme.colors.checkpointLocked
          : theme.colors.triviaLocked,
        theme.colors.checkpointUnlocked,
      ],
    ),
  );

  const outerAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: activeColorDV.value,
  }));

  const innerAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: activeColorDV.value,
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
      {/* Point circles - will be wrapped with animation later */}
      <TouchableOpacity
        style={styles.circleContainer}
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {type === 'trivia' ? (
          /* Simple filled circle for trivia */
          <Animated.View style={[styles.innerCircle, innerAnimatedStyle]} />
        ) : (
          /* Target icon for checkpoints */
          <>
            {/* Outer circle */}
            <Animated.View style={[styles.outerCircle, outerAnimatedStyle]}>
              {/* Inner circle */}
              <Animated.View style={[styles.innerCircle, innerAnimatedStyle]} />
            </Animated.View>
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
            type="label"
            size={
              labelSize === 'small'
                ? 'small'
                : labelSize === 'large'
                ? 'large'
                : 'default'
            }
            textSize={
              labelSize === 'small'
                ? 'small'
                : labelSize === 'large'
                ? 'large'
                : 'default'
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {name}
          </Button>
        </Animated.View>
      )}
    </View>
  );
}

export default memo(Point);

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
