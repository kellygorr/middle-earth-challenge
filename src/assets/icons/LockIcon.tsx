import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface LockIconProps {
  size?: number;
  color?: string;
}

export default function LockIcon({
  size = 24,
  color = '#FFFFFF',
}: LockIconProps) {
  // Lock icon: padlock shape with shackle on top
  // Viewbox is 24x24
  const scale = size / 24;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Shackle (the curved part on top) */}
      <Path
        d="M7 10V7a5 5 0 0 1 10 0v3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Lock body */}
      <Rect x={5} y={10} width={14} height={11} rx={2} fill={color} />
    </Svg>
  );
}
