import React from 'react';
import Svg, { Line } from 'react-native-svg';

interface PlusIconProps {
  size?: number;
  color?: string;
}

export default function PlusIcon({ size = 32, color = '#000' }: PlusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Line
        x1="16"
        y1="6"
        x2="16"
        y2="26"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Line
        x1="6"
        y1="16"
        x2="26"
        y2="16"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  );
}
