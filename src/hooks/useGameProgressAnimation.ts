import { useEffect, useRef, useState } from 'react';
import {
  useSharedValue,
  withTiming,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { motion } from '../styles/motion';

export function useGameProgressAnimation(
  miles: number | undefined,
  enabled: boolean = true,
  extraDeps: any[] = [],
) {
  const initialProgress =
    enabled && miles ? mapBookMilesToPathProgress(miles) : 0;
  const gameProgressValue = useSharedValue(initialProgress);
  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  const prevAnimMilesRef = useRef<number>(enabled ? miles || 0 : 0);

  useEffect(() => {
    if (!enabled) {
      // Hide progress until enabled (e.g., after welcome + path reveal)
      gameProgressValue.value = 0;
      return;
    }
    const currentMiles = miles || 0;
    const target = mapBookMilesToPathProgress(currentMiles);
    const delta = Math.abs(currentMiles - (prevAnimMilesRef.current || 0));
    const base = motion.pathReveal.duration;
    let factor = 2.8;
    if (delta < 50) factor = 1.0;
    else if (delta < 300) factor = 1.5;
    else if (delta < 600) factor = 2.2;
    const durationMs = Math.max(120, Math.round(base * factor));
    const easingCurve =
      delta < 50
        ? motion.easing.inOut
        : delta < 300
        ? motion.easing.standard
        : motion.easing.inOut;

    gameProgressValue.value = withTiming(target, {
      duration: durationMs,
      easing: easingCurve,
    });
    prevAnimMilesRef.current = currentMiles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miles, enabled, gameProgressValue, ...extraDeps]);

  useAnimatedReaction(
    () => gameProgressValue.value,
    val => {
      runOnJS(setAnimatedProgress)(val);
    },
    [gameProgressValue],
  );

  return { gameProgressValue, animatedProgress } as const;
}
