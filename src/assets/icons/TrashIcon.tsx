import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface TrashIconProps {
  size?: number;
  color?: string;
}

/**
 * Simple outlined trash / delete icon. Uses a stroke-only silhouette so
 * it reads cleanly against theme surfaces at small sizes.
 */
export default function TrashIcon({ size = 24, color }: TrashIconProps) {
  const strokeWidth = Math.max(1.75, size / 14);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lid */}
      <Path
        d="M4 7 H20"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Handle */}
      <Path
        d="M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bin */}
      <Path
        d="M6 7 L7 20 a1 1 0 0 0 1 1 h8 a1 1 0 0 0 1 -1 L18 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner strokes */}
      <Path
        d="M10 11 V17 M14 11 V17"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
