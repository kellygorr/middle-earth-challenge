import React from 'react';
import Svg, { Line } from 'react-native-svg';

interface CloseIconProps {
  size?: number;
  color?: string;
}

export default function CloseIcon({ size = 24, color }: CloseIconProps) {
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
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1={end}
        y1={inset}
        x2={inset}
        y2={end}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
