import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

interface RecenterIconProps {
  size?: number;
  color?: string;
}

export default function RecenterIcon({
  size = 24,
  color = '#000',
}: RecenterIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Outer circle */}
      <Circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      {/* Inner dot */}
      <Circle cx="12" cy="12" r="2" fill={color} />
      {/* Crosshairs - top */}
      <Line x1="12" y1="1" x2="12" y2="5" stroke={color} strokeWidth="2" />
      {/* Crosshairs - bottom */}
      <Line x1="12" y1="19" x2="12" y2="23" stroke={color} strokeWidth="2" />
      {/* Crosshairs - left */}
      <Line x1="1" y1="12" x2="5" y2="12" stroke={color} strokeWidth="2" />
      {/* Crosshairs - right */}
      <Line x1="19" y1="12" x2="23" y2="12" stroke={color} strokeWidth="2" />
    </Svg>
  );
}
