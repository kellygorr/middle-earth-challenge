import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface DevModeIconProps {
  size?: number;
  color?: string;
}

export default function DevModeIcon({ size = 32, color }: DevModeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left lens */}
      <Circle cx="6" cy="12" r="4" stroke={color} strokeWidth="2" fill="none" />
      {/* Right lens */}
      <Circle
        cx="18"
        cy="12"
        r="4"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      {/* Bridge between lenses */}
      <Path
        d="M10 12 L14 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left temple */}
      <Path
        d="M2 10 L2 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right temple */}
      <Path
        d="M22 10 L22 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}
