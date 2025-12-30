import React from 'react';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../../stores/settingsStore';

interface CloseButtonProps {
  size?: number;
  color?: string;
}

export default function CloseButton({ size = 24, color }: CloseButtonProps) {
  const theme = useTheme();
  const strokeColor = color ?? theme.colors.textPrimary;
  const strokeWidth = Math.max(2, Math.round(size / 12));
  const inset = Math.round(size * 0.22);
  const end = size - inset;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Line
        x1={inset}
        y1={inset}
        x2={end}
        y2={end}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1={end}
        y1={inset}
        x2={inset}
        y2={end}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
