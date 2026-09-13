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
  labelPosition?: 'top' | 'right' | 'left';
  labelHeight: number;
  type?: 'checkpoint' | 'trivia';
  onPress?: () => void;
}

function Point({
  name,
  isActive,
  showLabel,
  labelPosition = 'right',
  labelHeight,
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
  const pointTypeLabel = type === 'checkpoint' ? 'Checkpoint' : 'Trivia';
  const accessibilityLabel =
    type === 'checkpoint'
      ? `${name}, ${pointTypeLabel}, ${isActive ? 'reached' : 'locked'}`
      : `${name}, ${pointTypeLabel}`;

  return (
    <View
      style={[
        styles.container,
        { marginLeft: -centerOffset, marginTop: -centerOffset },
        // 'top' stacks the label above the icon via column-reverse and is
        // compensated externally in PositionedPoint (it shifts the whole
        // wrapper up by labelHeight to cancel the resulting offset).
        // Every other position uses a fixed 24x24 icon box with the label
        // absolutely positioned beside it — that keeps the icon's own
        // layout completely independent of label height/size, so growing
        // the label (e.g. the "large" label-size setting) can never shift
        // where the icon renders. containerRow previously used a flex row
        // with alignItems: 'center', which let a taller label grow the
        // row's height and re-center the icon within it, visibly bumping
        // checkpoint markers off the path whenever label size changed.
        labelPosition === 'top' ? styles.containerColumn : styles.containerAnchored,
      ]}
      pointerEvents="box-none"
      testID="point-icon-container"
    >
      {/* Point circles - will be wrapped with animation later */}
      <TouchableOpacity
        style={styles.circleContainer}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Opens ${pointTypeLabel.toLowerCase()} details`}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {type === 'trivia' ? (
          /* Simple filled circle for trivia */
          <Animated.View style={[styles.triviaCircle, innerAnimatedStyle]} />
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
          testID="point-label-wrapper"
          style={[
            labelPosition === 'top'
              ? styles.nameContainerAbove
              : labelPosition === 'left'
              ? [styles.nameContainerLeft, { top: (24 - labelHeight) / 2 }]
              : [styles.nameContainerRight, { top: (24 - labelHeight) / 2 }],
            labelAnimatedStyle,
          ]}
          pointerEvents={showLabel ? 'auto' : 'none'}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
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
            isLabelButton
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
  containerColumn: {
    flexDirection: 'column-reverse', // Label above circle
    alignItems: 'flex-start', // Align to left edge
  },
  containerAnchored: {
    width: 24,
    height: 24,
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
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  nameContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nameContainerRight: {
    position: 'absolute',
    // 24 (icon width) + 6 (gap), mirroring nameContainerLeft's 30px offset
    // on the other side, so the visual gap to the icon matches either way.
    left: 30,
    // minWidth is required, not optional: an absolutely positioned View
    // with no width hint at all collapses toward zero here and wraps its
    // Text one character per line (this codebase's proven working
    // nameContainerLeft below has always paired minWidth with an
    // alignItems override for exactly this reason). alignItems: 'flex-start'
    // then keeps the actual visible label pill sized to its own content
    // instead of stretching to fill that reserved minWidth — the reserved
    // space beyond a short name like "Bree" is empty and invisible, not a
    // visibly padded pill.
    minWidth: 120,
    alignItems: 'flex-start',
  },
  nameContainerLeft: {
    position: 'absolute',
    right: 30,
    minWidth: 120,
    alignItems: 'flex-end',
  },
  nameContainerAbove: {
    marginBottom: 4,
  },
});
