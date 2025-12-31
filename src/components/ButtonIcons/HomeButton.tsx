import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface HomeButtonProps {
  size?: number;
  color?: string;
  pressedColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function HomeButton({
  size = 24,
  color,
  pressedColor,
  onPress,
  style,
}: HomeButtonProps) {
  const theme = useTheme();
  const baseColor = color ?? theme.colors.textPrimary;
  const downColor = pressedColor ?? theme.colors.buttonPressed;

  const renderIcon = (c: string) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill={c} />
    </Svg>
  );

  if (onPress) {
    return (
      <Pressable style={style} onPress={onPress} hitSlop={8}>
        {({ pressed }) => renderIcon(pressed ? downColor : baseColor)}
      </Pressable>
    );
  }

  return <View style={style}>{renderIcon(baseColor)}</View>;
}
