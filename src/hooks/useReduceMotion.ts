import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  // Defaults to false (animations on) rather than true: the real OS value
  // isn't known until the async check below resolves a moment later, and
  // defaulting to true meant the very first animation of the app session
  // (e.g. the active-path catch-up animation right after Welcome
  // dismisses) always played as an instant jump with no animation at all
  // for the overwhelming majority of users who don't have Reduce Motion
  // enabled — confirmed on-device: a real device with the OS setting off
  // still snapped instantly on that first animation. A user who genuinely
  // has Reduce Motion on may see one animation play before this resolves
  // to true, which is a far smaller, one-time cosmetic issue than every
  // other user's first animation being silently broken every session.
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
