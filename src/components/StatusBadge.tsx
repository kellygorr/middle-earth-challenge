import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { useTheme } from '../stores/settingsStore';
import { usePrefersReducedMotion } from '../hooks/useReduceMotion';
import { spacing } from '../styles/global';
import { typography, typographyThemed } from '../styles/typography';

interface StatusBadgeProps {
  label: string;
  inProgress?: boolean;
  /**
   * `neutral` is the grey treatment used when there is nothing to report.
   * `accent` uses the theme's `errorCardAccent` background with white
   * text (`checkpointLabel`) — the sync-error card's category label chip.
   * `primary` reuses the primary-button color pair
   * (`buttonPrimaryBackground`/`buttonPrimaryText`) — black-on-white (or
   * near enough per theme) treatment for the upgrade-confirmation card's
   * "Completed" badge.
   */
  tone?: 'success' | 'neutral' | 'accent' | 'primary';
  /**
   * `default` is the existing badge size (unchanged). `small` reduces the
   * font size and padding to match the compact category-label chip style
   * (e.g. the sync-error card's headline-row badge).
   */
  size?: 'default' | 'small';
  visible?: boolean;
  reserveSpace?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({
  label,
  inProgress = false,
  tone = 'success',
  size = 'default',
  visible = true,
  reserveSpace = false,
  style,
}: StatusBadgeProps) {
  const theme = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!inProgress || !visible || prefersReducedMotion !== false) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [inProgress, pulse, prefersReducedMotion, visible]);

  if (!visible && !reserveSpace) return null;

  const animatedColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textPrimary, theme.colors.uiBadgeInProgress],
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[
        styles.badge,
        size === 'small' && styles.badgeSmall,
        inProgress
          ? { borderColor: animatedColor }
          : tone === 'neutral'
          ? {
              backgroundColor: theme.colors.uiBadgeNeutralBackground,
              borderColor: theme.colors.uiBadgeNeutralBackground,
            }
          : tone === 'accent'
          ? {
              backgroundColor: theme.colors.errorCardAccent,
              borderColor: theme.colors.errorCardAccent,
            }
          : tone === 'primary'
          ? {
              backgroundColor: theme.colors.buttonPrimaryBackground,
              borderColor: theme.colors.buttonPrimaryBackground,
            }
          : {
              backgroundColor: theme.colors.uiBadgeSuccessBackground,
              borderColor: theme.colors.uiBadgeSuccessBorder,
            },
        !visible && styles.hidden,
        style,
      ]}
    >
      <Animated.Text
        style={[
          typographyThemed(theme).captionPrimary,
          size === 'small' && styles.labelSmall,
          {
            color: inProgress
              ? animatedColor
              : tone === 'neutral'
              ? theme.colors.uiBadgeNeutralText
              : tone === 'accent'
              ? theme.colors.checkpointLabel
              : tone === 'primary'
              ? theme.colors.buttonPrimaryText
              : theme.colors.uiBadgeSuccessText,
          } as Animated.WithAnimatedObject<TextStyle>,
        ]}
      >
        {label}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  labelSmall: {
    ...typography.caption3Bold,
    textTransform: 'uppercase',
  },
  hidden: {
    opacity: 0,
  },
});
