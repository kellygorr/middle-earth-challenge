import React from 'react';
import { Pressable, StyleSheet, Insets } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius } from '../../styles/global';

interface RecenterButtonProps {
  size?: number;
  color?: string;
  onPress?: () => void;
  hitSlop?: Insets;
}

export default function RecenterButton({
  size = 24,
  color,
  onPress,
  hitSlop,
}: RecenterButtonProps) {
  const theme = useTheme();
  const strokeColor = color ?? theme.colors.buttonPrimaryText;
  const Icon = (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Outer circle */}
      <Circle
        cx="12"
        cy="12"
        r="9"
        stroke={strokeColor}
        strokeWidth="2"
        fill="none"
      />
      {/* Inner dot */}
      <Circle cx="12" cy="12" r="2" fill={strokeColor} />
      {/* Crosshairs - top */}
      <Line
        x1="12"
        y1="1"
        x2="12"
        y2="5"
        stroke={strokeColor}
        strokeWidth="2"
      />
      {/* Crosshairs - bottom */}
      <Line
        x1="12"
        y1="19"
        x2="12"
        y2="23"
        stroke={strokeColor}
        strokeWidth="2"
      />
      {/* Crosshairs - left */}
      <Line
        x1="1"
        y1="12"
        x2="5"
        y2="12"
        stroke={strokeColor}
        strokeWidth="2"
      />
      {/* Crosshairs - right */}
      <Line
        x1="19"
        y1="12"
        x2="23"
        y2="12"
        stroke={strokeColor}
        strokeWidth="2"
      />
    </Svg>
  );

  if (!onPress) return Icon;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.touch,
        {
          backgroundColor: pressed
            ? theme.colors.buttonPressed
            : theme.colors.buttonPrimaryBackground,
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
