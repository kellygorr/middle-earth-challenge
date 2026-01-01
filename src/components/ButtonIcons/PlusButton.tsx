import React from 'react';
import { Pressable, View, StyleSheet, Insets } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius } from '../../styles/global';

interface PlusButtonProps {
  size?: number;
  color?: string;
  onPress?: () => void;
  hitSlop?: Insets;
}

export default function PlusButton({
  size = 32,
  color,
  onPress,
  hitSlop,
}: PlusButtonProps) {
  const theme = useTheme();
  const strokeColor = color ?? theme.colors.buttonPrimaryText;
  const Icon = (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Plus icon: vertical and horizontal lines */}
      <Line
        x1="16"
        y1="6"
        x2="16"
        y2="26"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Line
        x1="6"
        y1="16"
        x2="26"
        y2="16"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
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
            backgroundColor: theme.colors.buttonPrimaryBackground,
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
