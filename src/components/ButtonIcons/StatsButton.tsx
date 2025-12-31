import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';
import { borderRadius } from '../../styles/global';

interface StatsButtonProps {
  size?: number;
  color?: string;
  onPress?: () => void;
}

export default function StatsButton({
  size = 32,
  color,
  onPress,
}: StatsButtonProps) {
  const theme = useTheme();
  const fillColor = color ?? theme.colors.buttonPrimaryText;

  // Clipboard icon with list lines
  const Icon = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 4H18C18.5304 4 19.0391 4.21071 19.4142 4.58579C19.7893 4.96086 20 5.46957 20 6V20C20 20.5304 19.7893 21.0391 19.4142 21.4142C19.0391 21.7893 18.5304 22 18 22H6C5.46957 22 4.96086 21.7893 4.58579 21.4142C4.21071 21.0391 4 20.5304 4 20V6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H8"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 2H9C8.44772 2 8 2.44772 8 3V5C8 5.55228 8.44772 6 9 6H15C15.5523 6 16 5.55228 16 5V3C16 2.44772 15.5523 2 15 2Z"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 10H16"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M8 14H16"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M8 18H12"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
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
