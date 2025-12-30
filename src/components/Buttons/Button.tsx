import React, { useEffect, forwardRef } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../stores/settingsStore';
import { typography } from '../../styles/typography';
import { spacing, borderRadius } from '../../styles/global';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: 'primary' | 'brand' | 'outline';
  size?: 'small' | 'default' | 'large';
  isMediumText?: boolean;
  isOpen?: boolean;
  disabled?: boolean;
  hitSlop?:
    | number
    | { left?: number; right?: number; top?: number; bottom?: number };
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  function Button(
    {
      onPress,
      children,
      variant = 'primary',
      size = 'default',
      isMediumText,
      isOpen,
      disabled = false,
      hitSlop,
      style,
    }: ButtonProps,
    ref,
  ) {
    const theme = useTheme();
    const isFilled = true; // outline also has a filled (white) background

    // Background/border animation
    const progress = useSharedValue(isFilled ? 1 : 0);
    useEffect(() => {
      progress.value = withTiming(isFilled ? 1 : 0, { duration: 200 });
    }, [isFilled, progress]);

    // Pressed state animation
    const pressedSV = useSharedValue(0);
    const animatedStyle = useAnimatedStyle(() => {
      const filledColor =
        variant === 'brand'
          ? theme.colors.buttonBrandBackground
          : variant === 'outline'
          ? theme.colors.buttonOutlineBg
          : theme.colors.buttonPrimaryBackground;

      // Base background (filled vs transparent)
      const baseBackground = interpolateColor(
        progress.value,
        [0, 1],
        ['transparent', filledColor],
      );

      // Apply pressed overrides
      const backgroundColor =
        variant === 'outline'
          ? baseBackground
          : interpolateColor(
              pressedSV.value,
              [0, 1],
              [baseBackground, theme.colors.buttonPressed],
            );

      const baseBorderColor =
        variant === 'outline'
          ? theme.colors.buttonOutlineBorder
          : 'transparent';
      const borderColor = interpolateColor(
        pressedSV.value,
        [0, 1],
        [
          baseBorderColor,
          variant === 'outline' ? theme.colors.buttonPressed : 'transparent',
        ],
      );

      return { backgroundColor, borderColor };
    });

    // Caret animation (present when isOpen is provided)
    const hasCaret = typeof isOpen === 'boolean';
    const caretSV = useSharedValue(hasCaret ? (isOpen ? 1 : 0) : 0);
    useEffect(() => {
      if (hasCaret) {
        caretSV.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
      }
    }, [isOpen, hasCaret, caretSV]);
    const caretStyle = useAnimatedStyle(() => {
      const rotation = interpolate(caretSV.value, [0, 1], [0, 90]);
      return { transform: [{ rotate: `${rotation}deg` }] };
    });

    const opacityValue = disabled ? 0.5 : 1;
    const textColor =
      variant === 'primary'
        ? theme.colors.buttonPrimaryText
        : variant === 'brand'
        ? theme.colors.buttonBrandText
        : theme.colors.buttonOutlineText;

    // Text size: large for size 'large'; medium when isMediumText is true; else default
    const baseTextStyle =
      size === 'large'
        ? typography.buttonLarge
        : isMediumText
        ? typography.buttonMedium
        : typography.button;

    return (
      <AnimatedPressable
        ref={ref}
        style={[
          size === 'small'
            ? styles.buttonSmall
            : size === 'large'
            ? styles.buttonLarge
            : styles.button,
          animatedStyle,
          style,
          { opacity: opacityValue },
        ]}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) pressedSV.value = withTiming(1, { duration: 80 });
        }}
        onPressOut={() => {
          pressedSV.value = withTiming(0, { duration: 120 });
        }}
        disabled={disabled}
        hitSlop={hitSlop}
      >
        <Text style={[baseTextStyle, { color: textColor }]}>{children}</Text>
        {hasCaret && (
          <AnimatedText
            style={[
              baseTextStyle,
              { marginLeft: spacing.xs, color: textColor },
              caretStyle,
            ]}
          >
            ▶
          </AnimatedText>
        )}
      </AnimatedPressable>
    );
  },
);

export default Button;

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonSmall: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonLarge: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
