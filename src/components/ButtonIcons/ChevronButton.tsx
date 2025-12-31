import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface ChevronButtonProps {
  direction: 'left' | 'right';
  size?: number;
  color?: string;
  pressedColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function ChevronButton({
  direction,
  size = 24,
  color,
  pressedColor,
  onPress,
  style,
}: ChevronButtonProps) {
  const theme = useTheme();
  const baseColor = color ?? theme.colors.textPrimary;
  const downColor = pressedColor ?? theme.colors.buttonPressed;

  const renderIcon = (c: string) => {
    // Chevron path - flipped for left/right
    const path =
      direction === 'left'
        ? 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'
        : 'M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z';

    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={path} fill={c} />
      </Svg>
    );
  };

  if (onPress) {
    return (
      <Pressable
        style={style}
        onPress={onPress}
        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
      >
        {({ pressed }) => renderIcon(pressed ? downColor : baseColor)}
      </Pressable>
    );
  }

  return <View style={style}>{renderIcon(baseColor)}</View>;
}
