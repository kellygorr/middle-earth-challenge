import React, { useEffect } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Button({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  // Animated value: 0 = secondary (transparent), 1 = primary (filled)
  const progress = useSharedValue(isPrimary ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isPrimary ? 1 : 0, { duration: 200 });
  }, [isPrimary, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      ['transparent', theme.colors.buttonPrimary],
    );

    const borderColor = interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.buttonPrimary, 'transparent'],
    );

    return {
      backgroundColor,
      borderColor,
    };
  });

  return (
    <AnimatedPressable
      style={[
        styles.button,
        animatedStyle,
        {
          borderWidth: 2,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          typography.button,
          {
            color: isPrimary
              ? theme.colors.buttonText
              : theme.colors.textPrimary,
          },
        ]}
      >
        {children}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
