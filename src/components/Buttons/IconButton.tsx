import React, { ReactNode, ReactElement, isValidElement } from 'react';
import {
  Pressable,
  View,
  Insets,
  StyleProp,
  ViewStyle,
  StyleSheet,
} from 'react-native';
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
  /** When true, the button is non-interactive and renders at 50% opacity. */
  disabled?: boolean;
  /** When true, renders a small red dot in the top-right of the button. */
  showBadge?: boolean;
  /** Optional override color for the badge dot. */
  badgeColor?: string;
  /** Announced by screen readers; an icon alone conveys nothing to them. */
  accessibilityLabel?: string;
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
  disabled = false,
  showBadge = false,
  badgeColor,
  accessibilityLabel,
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

  // Small dot in the top-right corner, used to signal an unresolved
  // problem (e.g. last sync errored). Defaults to amber rather than red
  // because some sync issues are advisory — the user may choose not to
  // reconnect their health app and continue logging miles manually. Red
  // would over-state the severity.
  const badgeSize = 14;
  const badge = showBadge ? (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: badgeColor ?? '#F4B400',
          borderColor: theme.colors.background,
        },
      ]}
    />
  ) : null;

  // When no onPress, render as a non-interactive View
  if (!onPress) {
    return (
      <View
        style={[
          isTransparent
            ? styles.centered
            : { ...baseStyle, backgroundColor },
          style,
        ]}
      >
        {renderIcon(icon)}
        {badge}
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
            opacity: disabled ? 0.5 : pressed ? 0.5 : 1,
          },
          style,
        ]}
        onPress={onPress}
        hitSlop={normalizedHitSlop}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {({ pressed }) => (
          <>
            {pressed && pressedIcon ? pressedIcon : renderIcon(icon)}
            {badge}
          </>
        )}
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
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      hitSlop={normalizedHitSlop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {renderIcon(icon)}
      {badge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    borderWidth: 2,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
