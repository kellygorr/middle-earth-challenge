import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

interface AccessibilityStore {
  prefersReducedMotion: boolean | null;
  initializeReducedMotion: () => void;
}

let reduceMotionSubscription: { remove: () => void } | null = null;

export const useAccessibilityStore = create<AccessibilityStore>(set => ({
  prefersReducedMotion: null,
  initializeReducedMotion: () => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        set({ prefersReducedMotion: enabled });
      })
      .catch(() => {
        // Fail open to "motion allowed" so startup animations do not get
        // stuck in an unknown/null gate when platform probing fails.
        set({ prefersReducedMotion: false });
      });

    if (reduceMotionSubscription) return;
    reduceMotionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => {
        set({ prefersReducedMotion: enabled });
      },
    );
  },
}));
