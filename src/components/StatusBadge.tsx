import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { useTheme } from '../stores/settingsStore';
import { spacing } from '../styles/global';
import { typographyThemed } from '../styles/typography';

interface StatusBadgeProps {
  label: string;
  inProgress?: boolean;
  visible?: boolean;
  reserveSpace?: boolean;
  style?: StyleProp<ViewStyle>;
}

const IN_PROGRESS_COLOR = '#F5A623';

export function StatusBadge({
  label,
  inProgress = false,
  visible = true,
  reserveSpace = false,
  style,
}: StatusBadgeProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!inProgress || !visible) {
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
  }, [inProgress, pulse, visible]);

  if (!visible && !reserveSpace) return null;

  const animatedColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textPrimary, IN_PROGRESS_COLOR],
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[
        styles.badge,
        inProgress
          ? { borderColor: animatedColor }
          : {
              backgroundColor: theme.colors.successBg,
              borderColor: theme.colors.successBorder,
            },
        !visible && styles.hidden,
        style,
      ]}
    >
      <Animated.Text
        style={[
          typographyThemed(theme).captionPrimary,
          {
            color: inProgress ? animatedColor : theme.colors.successText,
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
  hidden: {
    opacity: 0,
  },
});
