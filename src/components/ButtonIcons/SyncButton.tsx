import React from 'react';
import { Pressable, View, StyleSheet, Insets } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius } from '../../styles/global';

interface SyncButtonProps {
  size?: number;
  color?: string;
  variant?: 'primary' | 'brand';
  onPress?: () => void;
  hitSlop?: Insets;
}

export default function SyncButton({
  size = 32,
  color,
  variant = 'primary',
  onPress,
  hitSlop,
}: SyncButtonProps) {
  const theme = useTheme();
  const isBrand = variant === 'brand';
  const strokeColor =
    color ??
    (isBrand ? theme.colors.buttonBrandText : theme.colors.buttonPrimaryText);
  const bgColor = isBrand
    ? theme.colors.buttonBrandBackground
    : theme.colors.buttonPrimaryBackground;

  // Two curved arrows forming a circle (sync icon) - filled single-line paths
  const Icon = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Top arrow - curves from right to left with arrowhead */}
      <Path
        d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12H20C20 7.58 16.42 4 12 4Z"
        fill={strokeColor}
      />
      {/* Bottom arrow - curves from left to right with arrowhead */}
      <Path
        d="M12 20V23L16 19L12 15V18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20Z"
        fill={strokeColor}
      />
    </Svg>
  );

  // When no onPress, render as a View with background (for display-only use)
  if (!onPress) {
    return (
      <View
        style={[
          styles.touch,
          {
            backgroundColor: bgColor,
            borderRadius: borderRadius.full,
          },
        ]}
      >
        {Icon}
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.touch,
        {
          backgroundColor: pressed ? theme.colors.buttonPressed : bgColor,
          borderRadius: borderRadius.full,
        },
      ]}
      onPress={onPress}
      hitSlop={hitSlop}
    >
      {Icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
