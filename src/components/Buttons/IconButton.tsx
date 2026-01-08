import React, { ReactNode, ReactElement, isValidElement } from 'react';
import { Pressable, View, Insets, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius, iconButtonSizes } from '../../styles/global';
import {
  ButtonVariant,
  getButtonTextColor,
  getButtonBackgroundColor,
  getButtonBorderColor,
} from './buttonColors';

type ButtonSize = 'small' | 'medium' | 'large';

/** Convert number to Insets object or pass through Insets */
const normalizeHitSlop = (hitSlop?: Insets | number): Insets | undefined => {
  if (typeof hitSlop === 'number') {
    return { top: hitSlop, right: hitSlop, bottom: hitSlop, left: hitSlop };
  }
  return hitSlop;
};

interface IconButtonProps {
  /** The icon to render inside the button. Color will be set automatically based on variant unless explicitly provided. */
  icon: ReactNode;
  /** Icon to render when pressed (optional, for transparent variant) */
  pressedIcon?: ReactNode;
  /** Called when the button is pressed. If not provided, renders as a non-interactive View */
  onPress?: () => void;
  /** Button size - maps to iconButtonSizes tokens */
  size?: ButtonSize;
  /** Button variant for theming. 'transparent' renders no background, 'outline' has border */
  variant?: ButtonVariant;
  /** Expand the touch target beyond the button bounds. Can be a number for uniform insets or an Insets object */
  hitSlop?: Insets | number;
  /** Additional style for the button container */
  style?: StyleProp<ViewStyle>;
}

/**
 * Reusable icon button component with consistent styling.
 * Renders a circular button with the provided icon.
 * Icon color is automatically set based on variant unless explicitly provided.
 *
 * Usage:
 * ```tsx
 * <IconButton
 *   icon={<SettingsIcon size={24} />}
 *   onPress={() => console.log('pressed')}
 *   size="medium"
 *   variant="primary"
 * />
 * ```
 */
export default function IconButton({
  icon,
  pressedIcon,
  onPress,
  size = 'medium',
  variant = 'primary',
  hitSlop,
  style,
}: IconButtonProps) {
  const theme = useTheme();

  const buttonSize = iconButtonSizes[size];
  const isTransparent = variant === 'transparent';
  const isOutline = variant === 'outline';
  const backgroundColor = getButtonBackgroundColor(theme, variant);
  const borderColor = getButtonBorderColor(theme, variant);
  const borderWidth = 2;

  // Get icon color based on variant
  const getIconColor = () => getButtonTextColor(theme, variant);

  // Shared base style for non-transparent variants
  const baseStyle = {
    width: buttonSize,
    height: buttonSize,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: borderRadius.full,
    borderColor,
    borderWidth,
  };

  // Clone icon with color if it's a valid element and doesn't have explicit color
  const renderIcon = (iconElement: ReactNode) => {
    if (isValidElement(iconElement)) {
      const iconProps = iconElement.props as Record<string, unknown>;
      // Only inject color if not explicitly provided
      if (!iconProps.color) {
        return React.cloneElement(
          iconElement as ReactElement<{ color?: string }>,
          { color: getIconColor() },
        );
      }
    }
    return iconElement;
  };

  // When no onPress, render as a non-interactive View
  if (!onPress) {
    return (
      <View
        style={[
          isTransparent
            ? { alignItems: 'center', justifyContent: 'center' }
            : { ...baseStyle, backgroundColor },
          style,
        ]}
      >
        {renderIcon(icon)}
      </View>
    );
  }

  const normalizedHitSlop = normalizeHitSlop(hitSlop);

  // Transparent variant - same size, no visible background, opacity feedback on press
  if (isTransparent) {
    return (
      <Pressable
        style={({ pressed }) => [
          {
            width: buttonSize,
            height: buttonSize,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            opacity: pressed ? 0.5 : 1,
          },
          style,
        ]}
        onPress={onPress}
        hitSlop={normalizedHitSlop}
      >
        {({ pressed }) =>
          pressed && pressedIcon ? pressedIcon : renderIcon(icon)
        }
      </Pressable>
    );
  }

  // Standard button with background (and optional border for outline)
  return (
    <Pressable
      style={({ pressed }) => [
        {
          ...baseStyle,
          backgroundColor: pressed
            ? theme.colors.buttonPressed
            : backgroundColor,
          borderColor:
            pressed && isOutline ? theme.colors.buttonPressed : borderColor,
        },
        style,
      ]}
      onPress={onPress}
      hitSlop={normalizedHitSlop}
    >
      {renderIcon(icon)}
    </Pressable>
  );
}
