import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface StarIconProps {
  size?: number;
  color?: string;
}

export default function StarIcon({
  size = 24,
  color = '#FFFFFF',
}: StarIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m12 2.5 2.82 5.72 6.31.92-4.56 4.44 1.08 6.28L12 16.9l-5.65 2.96 1.08-6.28-4.56-4.44 6.31-.92L12 2.5Z"
        fill={color}
      />
    </Svg>
  );
}
