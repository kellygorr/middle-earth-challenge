// hooks/useReactiveDimensions.ts
import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

export function useReactiveDimensions() {
  const [window, setWindow] = useState(Dimensions.get('window'));

  useEffect(() => {
    const handler = ({ window }: { window: ScaledSize }) => {
      setWindow(window);
    };

    const subscription = Dimensions.addEventListener('change', handler);

    return () => {
      subscription?.remove();
    };
  }, []);

  return {
    width: window.width,
    height: window.height,
  };
}
