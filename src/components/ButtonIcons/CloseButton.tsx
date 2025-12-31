import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface CloseButtonProps {
  size?: number;
  color?: string;
  pressedColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function CloseButton({
  size = 24,
  color,
  pressedColor,
  onPress,
  style,
}: CloseButtonProps) {
  const theme = useTheme();
  const baseColor = color ?? theme.colors.textPrimary;
  const downColor = pressedColor ?? theme.colors.buttonPressed;
  const strokeWidth = Math.max(2, Math.round(size / 12));
  const inset = Math.round(size * 0.22);
  const end = size - inset;

  const renderIcon = (c: string) => {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Line
          x1={inset}
          y1={inset}
          x2={end}
          y2={end}
          stroke={c}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <Line
          x1={end}
          y1={inset}
          x2={inset}
          y2={end}
          stroke={c}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </Svg>
    );
  };

  if (onPress) {
    return (
      <Pressable
        style={style}
        onPress={onPress}
        hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
      >
        {({ pressed }) => renderIcon(pressed ? downColor : baseColor)}
      </Pressable>
    );
  }

  return <View style={style}>{renderIcon(baseColor)}</View>;
}
