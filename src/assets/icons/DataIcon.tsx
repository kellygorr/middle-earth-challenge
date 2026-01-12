import React from 'react';
import Svg, { Path, Ellipse } from 'react-native-svg';

interface DataIconProps {
  size?: number;
  color?: string;
}

/**
 * DataIcon - A database/cylinder icon representing data storage
 */
export default function DataIcon({ size = 32, color = '#000' }: DataIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Top ellipse */}
      <Ellipse
        cx="12"
        cy="5"
        rx="8"
        ry="3"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      {/* Left side */}
      <Path
        d="M4 5 L4 19"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right side */}
      <Path
        d="M20 5 L20 19"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Bottom ellipse (arc) */}
      <Path
        d="M4 19 C4 21.2 7.6 23 12 23 C16.4 23 20 21.2 20 19"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Middle divider line */}
      <Path
        d="M4 12 C4 14.2 7.6 16 12 16 C16.4 16 20 14.2 20 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
