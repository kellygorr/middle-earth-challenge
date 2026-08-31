import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ResetIconProps {
  size?: number;
  color?: string;
}

/**
 * Counter-clockwise circular arrow used for the "reset" affordance in
 * the edit-entry modal.
 */
export default function ResetIcon({ size = 24, color }: ResetIconProps) {
  const strokeWidth = Math.max(1.75, size / 14);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Counter-clockwise arc (Feather rotate-ccw). Opens at the top
          so the arrowhead can sit tangent to the arc pointing left. */}
      <Path
        d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrowhead: horizontal shaft + vertical drop meeting at (1,10) */}
      <Path
        d="M1 4v6h6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
