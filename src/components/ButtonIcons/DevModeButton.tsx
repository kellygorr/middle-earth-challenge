import React from 'react';
import { Pressable, StyleSheet, Insets, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius } from '../../styles/global';

interface DevModeButtonProps {
  size?: number;
  color?: string;
  variant?: 'primary' | 'brand';
  onPress?: () => void;
  hitSlop?: Insets;
}

export default function DevModeButton({
  size = 32,
  color,
  variant = 'primary',
  onPress,
  hitSlop,
}: DevModeButtonProps) {
  const theme = useTheme();
  const isBrand = variant === 'brand';
  const fillColor =
    color ??
    (isBrand ? theme.colors.buttonBrandText : theme.colors.buttonPrimaryText);
  const bgColor = isBrand
    ? theme.colors.buttonBrandBackground
    : theme.colors.buttonPrimaryBackground;

  // Glasses icon - clear eyeglasses design
  const Icon = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left lens */}
      <Circle
        cx="6"
        cy="12"
        r="4"
        stroke={fillColor}
        strokeWidth="2"
        fill="none"
      />
      {/* Right lens */}
      <Circle
        cx="18"
        cy="12"
        r="4"
        stroke={fillColor}
        strokeWidth="2"
        fill="none"
      />
      {/* Bridge between lenses */}
      <Path
        d="M10 12 L14 12"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left temple */}
      <Path
        d="M2 10 L2 12"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right temple */}
      <Path
        d="M22 10 L22 12"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );

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
