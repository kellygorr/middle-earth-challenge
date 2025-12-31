import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface EditButtonProps {
  size?: number;
  color?: string;
  pressedColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function EditButton({
  size = 24,
  color,
  pressedColor,
  onPress,
  style,
}: EditButtonProps) {
  const theme = useTheme();
  const baseColor = color ?? theme.colors.textPrimary;
  const downColor = pressedColor ?? theme.colors.buttonPressed;

  const renderIcon = (c: string) => {
    // Pencil icon - scales via viewBox
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
          fill={c}
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
