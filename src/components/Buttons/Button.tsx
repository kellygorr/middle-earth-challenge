import React, {
  useEffect,
  forwardRef,
  ReactNode,
  isValidElement,
  ReactElement,
} from 'react';
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
import { ButtonVariant, getButtonTextColor } from './buttonColors';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: ButtonVariant;
  size?: 'small' | 'default' | 'large';
  isMediumText?: boolean;
  isOpen?: boolean;
  disabled?: boolean;
  hitSlop?:
    | number
    | { left?: number; right?: number; top?: number; bottom?: number };
  style?: StyleProp<ViewStyle>;
  /** Icon element to render before the text */
  iconBefore?: ReactNode;
  /** Self-alignment within parent container */
  align?: 'left' | 'center' | 'right';
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
      iconBefore,
      align,
    }: ButtonProps,
    ref,
  ) {
    const theme = useTheme();
    const isFilled = variant !== 'transparent';

    // Background/border animation
    const progress = useSharedValue(isFilled ? 1 : 0);
    useEffect(() => {
      progress.value = withTiming(isFilled ? 1 : 0, { duration: 200 });
    }, [isFilled, progress]);

    // Pressed state animation
    const pressedSV = useSharedValue(0);
    const animatedStyle = useAnimatedStyle(() => {
      // Disabled state for outline variant: use disabled colors
      if (disabled && variant === 'outline') {
        return {
          backgroundColor: theme.colors.buttonDisabledBg,
          borderColor: 'transparent',
        };
      }

      // Transparent variant: use opacity for press feedback
      if (variant === 'transparent') {
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          opacity: interpolate(pressedSV.value, [0, 1], [1, 0.5]),
        };
      }

      // Inline color lookup to keep worklet-compatible
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

    const opacityValue = disabled && variant !== 'outline' ? 0.5 : 1;
    const textColor =
      disabled && variant === 'outline'
        ? theme.colors.buttonDisabledText
        : getButtonTextColor(theme, variant);

    // Clone iconBefore with color if needed
    const renderIconBefore = () => {
      if (!iconBefore) return null;
      if (isValidElement(iconBefore)) {
        const iconProps = iconBefore.props as Record<string, unknown>;
        if (!iconProps.color) {
          return React.cloneElement(
            iconBefore as ReactElement<{ color?: string }>,
            { color: textColor },
          );
        }
      }
      return iconBefore;
    };

    // Text size: large for size 'large'; medium when isMediumText is true; else default
    const baseTextStyle =
      size === 'large'
        ? typography.buttonLarge
        : isMediumText
        ? typography.buttonMedium
        : typography.button;

    const alignSelf =
      align === 'left'
        ? 'flex-start'
        : align === 'right'
        ? 'flex-end'
        : align === 'center'
        ? 'center'
        : undefined;

    // Reduce left padding when left-aligned (so content appears flush with container edge)
    const alignPadding =
      align === 'left'
        ? { paddingLeft: spacing.sm }
        : align === 'right'
        ? { paddingRight: spacing.sm }
        : undefined;

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
          alignSelf ? { alignSelf } : undefined,
          alignPadding,
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
        {renderIconBefore()}
        <Text
          style={[
            baseTextStyle,
            { color: textColor },
            iconBefore ? { marginLeft: spacing.xs } : undefined,
          ]}
        >
          {children}
        </Text>
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
