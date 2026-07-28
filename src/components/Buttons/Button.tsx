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
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import {
  typography,
  textSizeScale,
  scaleTextStyle,
} from '../../styles/typography';
import { spacing, buttonTokens } from '../../styles/global';
import { ButtonVariant, getButtonTextColor } from './buttonColors';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: ButtonVariant;
  /**
   * Visual category:
   * - `'regular'` (default) — standard button chrome driven by `size`.
   * - `'label'` — tighter chrome used for on-map text chips. Same `size` axis,
   *   different padding/radius scale.
   */
  type?: 'regular' | 'label';
  size?: 'xs' | 'small' | 'default' | 'large';
  /** Override text size independently of the button's padding size. */
  textSize?: 'small' | 'default' | 'large';
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
  /** Remove corner rounding on one side (useful for buttons docked to a screen edge). */
  flatSide?: 'left' | 'right';
  /**
   * On-map buttons (checkpoint name labels, miles pill, info button, on-map
   * Labels toggle) must be sized only by the Label size setting. Pass `true`
   * to skip global Text size scaling.
   */
  isLabelButton?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

const Button = forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  function Button(
    {
      onPress,
      children,
      variant = 'primary',
      type = 'regular',
      size = 'default',
      textSize,
      isOpen,
      disabled = false,
      hitSlop,
      style,
      iconBefore,
      align,
      flatSide,
      isLabelButton = false,
    }: ButtonProps,
    ref,
  ) {
    const theme = useTheme();
    const textSizePref = useSettingsStore(s => s.textSize);
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
          : variant === 'outline' || variant === 'primaryInverted'
          ? theme.colors.buttonOutlineBg
          : theme.colors.buttonPrimaryBackground;

      // Base background (filled vs transparent)
      const baseBackground = interpolateColor(
        progress.value,
        [0, 1],
        ['transparent', filledColor],
      );

      // Apply pressed overrides
      const pressedColor =
        variant === 'primaryInverted'
          ? theme.colors.buttonPressedInverted
          : theme.colors.buttonPressed;
      const backgroundColor =
        variant === 'outline'
          ? baseBackground
          : interpolateColor(
              pressedSV.value,
              [0, 1],
              [baseBackground, pressedColor],
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

    // Text size: explicit `textSize` wins; else 'large' button size implies large text; else default.
    const rawTextStyle =
      textSize === 'large' || size === 'large'
        ? typography.buttonLarge
        : textSize === 'default'
        ? typography.buttonMedium
        : typography.button;

    // Apply global Text size scaling unless this is an on-map label button.
    const baseTextStyle = isLabelButton
      ? rawTextStyle
      : scaleTextStyle(rawTextStyle, textSizeScale[textSizePref]);

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

    const flatSideStyle =
      flatSide === 'left'
        ? styles.flatLeft
        : flatSide === 'right'
        ? styles.flatRight
        : undefined;

    // Resolve chrome from tokens. `type` selects the padding/radius scale;
    // `size` indexes into it. `xs` is regular-only; label falls back to small.
    const padScale = buttonTokens.padding[type] as Record<
      string,
      { vertical: number; horizontal: number }
    >;
    const radiusScale = buttonTokens.radius[type] as Record<string, number>;
    const resolvedSize = padScale[size] ? size : 'small';
    const pad = padScale[resolvedSize];
    const chromeStyle = {
      paddingVertical: pad.vertical,
      paddingHorizontal: pad.horizontal,
      borderRadius: radiusScale[resolvedSize],
    };

    return (
      <AnimatedPressable
        ref={ref}
        style={[
          styles.buttonBase,
          chromeStyle,
          animatedStyle,
          alignSelf ? { alignSelf } : undefined,
          alignPadding,
          flatSideStyle,
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

/**
 * Map a user-facing label-size preference (small / medium / large) onto the
 * Button `size` / `textSize` axis (small / default / large). Used by the
 * on-map buttons that scale with the label-size setting.
 */
export function labelSizeToButtonSize(
  labelSize: 'small' | 'medium' | 'large',
): 'small' | 'default' | 'large' {
  if (labelSize === 'small') return 'small';
  if (labelSize === 'large') return 'large';
  return 'default';
}

const styles = StyleSheet.create({
  buttonBase: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  flatLeft: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  flatRight: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
});
