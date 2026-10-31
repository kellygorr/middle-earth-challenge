import { useEffect } from 'react';
import { useAccessibilityStore } from '../stores/accessibilityStore';

export function usePrefersReducedMotion(): boolean | null {
  const prefersReducedMotion = useAccessibilityStore(
    state => state.prefersReducedMotion,
  );
  const initializeReducedMotion = useAccessibilityStore(
    state => state.initializeReducedMotion,
  );

  useEffect(() => {
    initializeReducedMotion();
  }, [initializeReducedMotion]);

  return prefersReducedMotion;
}

export function useReduceMotion(): boolean {
  return usePrefersReducedMotion() === true;
}
