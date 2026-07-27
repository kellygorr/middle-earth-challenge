// hooks/useReactiveDimensions.ts
import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

export function useReactiveDimensions() {
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const handler = ({ window }: { window: ScaledSize }) => {
      setDims(window);
    };

    const subscription = Dimensions.addEventListener('change', handler);

    return () => {
      subscription?.remove();
    };
  }, []);

  return {
    width: dims.width,
    height: dims.height,
  };
}
