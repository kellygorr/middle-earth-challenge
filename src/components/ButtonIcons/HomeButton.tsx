import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface HomeButtonProps {
  size?: number;
  color?: string;
}

export default function HomeButton({ size = 24, color }: HomeButtonProps) {
  const theme = useTheme();
  const fillColor = color ?? theme.colors.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Filled house shape */}
      <Path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill={fillColor} />
    </Svg>
  );
}
