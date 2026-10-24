import React, { useEffect, memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Button from '../Buttons';
import Animated, {
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  interpolateColor,
  useDerivedValue,
  SharedValue,
} from 'react-native-reanimated';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';

interface PointProps {
  x: number;
  y: number;
  name: string;
  // Single active flag for both checkpoint outline and inner fill, and for
  // trivia. When `gameProgressValue` (below) is not supplied, this is the
  // sole driver of the color transition (legacy/standalone-usage path,
  // e.g. tests). When it IS supplied, this prop is only used to seed the
  // very first render's color and to label accessibility text — the
  // ongoing color transition instead runs entirely on the UI thread,
  // driven directly by `gameProgressValue`.
  isActive: boolean;
  showLabel: boolean;
  labelPosition?: 'top' | 'right' | 'left';
  labelHeight: number;
  type?: 'checkpoint' | 'trivia';
  onPress?: () => void;
  /**
   * The map's raw animated progress (0..1), updated every frame on the UI
   * thread. Optional — when provided, activation state is computed via a
   * worklet-only useDerivedValue/useAnimatedReaction chain instead of
   * reacting to the `isActive` prop, so this Point's color transition
   * never depends on a JS re-render at all. This is what actually fixes
   * the JS/UI thread contention that was contributing to choppiness
   * during the map's path-fill animation: previously, EVERY checkpoint
   * and trivia point recomputed `isActive` in JS and re-rendered on every
   * throttled progress-bridge tick, regardless of whether that
   * particular point's activation state actually changed.
   */
  gameProgressValue?: SharedValue<number>;
  /** This point's activation threshold (0..1 progress fraction). Required
   * alongside `gameProgressValue` to compute activation on the UI thread. */
  activationProgress?: number;
  /** Whether the user is currently moving backward relative to this
   * point (mirrors PointLayer's existing directional-buffer logic). */
  goingBackward?: boolean;
  /** Activation buffer (in progress units) — same value PointLayer
   * already computes today, just passed through for the worklet. */
  buffer?: number;
  /** True for the always-active start checkpoint — bypasses the
   * progress-based comparison entirely, same as PointLayer's existing
   * `kind === 'checkpoint' && item.isStart` special case. */
  forceActive?: boolean;
}

function Point({
  name,
  isActive,
  showLabel,
  labelPosition = 'right',
  labelHeight,
  type = 'checkpoint',
  onPress,
  gameProgressValue,
  activationProgress = 0,
  goingBackward = false,
  buffer = 0,
  forceActive = false,
}: PointProps) {
  const theme = useTheme();
  const labelSize = useSettingsStore(state => state.labelSize);

  // Color transitions handled via animated styles

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showLabel ? 1 : 0, { duration: 200 }),
  }));
  // Activation animation progress for checkpoint color transitions.
  // Seeded from the JS `isActive` prop so the very first render's color
  // is correct even before the UI-thread reaction (below) has run once.
  const activationSV = useSharedValue(isActive ? 1 : 0);

  // Legacy/fallback path: no gameProgressValue supplied, so there is no
  // UI-thread signal to react to — fall back to the original behavior of
  // driving the transition directly off the `isActive` prop via a normal
  // effect. Exercised by unit tests and any other standalone usage.
  useEffect(() => {
    if (gameProgressValue) return;
    activationSV.value = withTiming(isActive ? 1 : 0, { duration: 100 });
  }, [isActive, activationSV, gameProgressValue]);

  // Primary path: gameProgressValue supplied (real map usage via
  // PointLayer). Activation is derived and reacted to entirely on the UI
  // thread — worklet in, worklet out, no runOnJS, no React re-render
  // involved in driving this point's own color transition.
  const isActiveUI = useDerivedValue(() => {
    'worklet';
    if (!gameProgressValue) return isActive;
    if (forceActive) return true;
    return goingBackward
      ? gameProgressValue.value >= activationProgress + buffer
      : gameProgressValue.value + buffer >= activationProgress;
  }, [gameProgressValue, activationProgress, goingBackward, buffer, forceActive, isActive]);

  useAnimatedReaction(
    () => isActiveUI.value,
    (curr, prev) => {
      if (!gameProgressValue) return;
      if (curr !== prev) {
        activationSV.value = withTiming(curr ? 1 : 0, { duration: 100 });
      }
    },
    [isActiveUI, gameProgressValue],
  );

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
