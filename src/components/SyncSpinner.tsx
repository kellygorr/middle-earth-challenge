import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { SyncIcon } from '../assets/icons';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { borderRadius } from '../styles/global';
import { useTheme } from '../stores/settingsStore';

interface SyncSpinnerProps {
  /** Outer diameter of the black circle. */
  size?: number;
  /** Icon size inside the circle. Defaults to ~60% of `size`. */
  iconSize?: number;
  /** Background circle color. */
  backgroundColor?: string;
  /** Icon color (inside the circle). */
  iconColor?: string;
  /** Rotation duration in ms per full revolution. */
  durationMs?: number;
}

/**
 * A black circle with a spinning sync (arrows) icon inside. Used as a
 * visual indicator next to modal titles while a sync is in progress.
 */
export default function SyncSpinner({
  size = 28,
  iconSize,
  backgroundColor,
  iconColor,
  durationMs = 1200,
}: SyncSpinnerProps) {
  const theme = useTheme();
  const reduceMotionEnabled = useReduceMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;
    if (reduceMotionEnabled) return;

    rotation.value = withRepeat(
      withTiming(360, {
        duration: durationMs,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation, durationMs, reduceMotionEnabled]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const resolvedIconSize = iconSize ?? Math.round(size * 0.6);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: borderRadius.full,
          backgroundColor:
            backgroundColor ?? theme.colors.buttonPrimaryBackground,
        },
      ]}
    >
      <Animated.View style={animatedStyle}>
        <SyncIcon
          size={resolvedIconSize}
          color={iconColor ?? theme.colors.iconInverted}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
