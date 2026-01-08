import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface SyncIconProps {
  size?: number;
  color?: string;
}

export default function SyncIcon({ size = 32, color = '#000' }: SyncIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Top arrow - curves from right to left with arrowhead */}
      <Path
        d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12H20C20 7.58 16.42 4 12 4Z"
        fill={color}
      />
      {/* Bottom arrow - curves from left to right with arrowhead */}
      <Path
        d="M12 20V23L16 19L12 15V18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20Z"
        fill={color}
      />
    </Svg>
  );
}
