import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface ClockIconProps {
  size?: number;
  color?: string;
}

/** Clock face used for the tracking-history affordance. */
export default function ClockIcon({ size = 24, color }: ClockIconProps) {
  const strokeWidth = Math.max(1.75, size / 14);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={12}
        cy={12}
        r={9}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Hands at roughly 10:10 so they read as a clock at small sizes. */}
      <Path
        d="M12 7v5l3.5 2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
