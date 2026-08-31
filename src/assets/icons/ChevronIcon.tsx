import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ChevronIconProps {
  direction: 'left' | 'right';
  size?: number;
  color?: string;
}

export default function ChevronIcon({
  direction,
  size = 24,
  color,
}: ChevronIconProps) {
  const path =
    direction === 'left'
      ? 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'
      : 'M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={path} fill={color} />
    </Svg>
  );
}
