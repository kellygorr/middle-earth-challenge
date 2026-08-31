import { useEffect, useRef, useState } from 'react';
import {
  useSharedValue,
  withTiming,
  useAnimatedReaction,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { motion } from '../styles/motion';
import { useReduceMotion } from './useReduceMotion';

export function useGameProgressAnimation(
  miles: number | undefined,
  enabled: boolean = true,
  extraDeps: any[] = [],
) {
  const reduceMotionEnabled = useReduceMotion();
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
    if (reduceMotionEnabled) {
      cancelAnimation(gameProgressValue);
      gameProgressValue.value = target;
      prevAnimMilesRef.current = currentMiles;
      return;
    }
    const delta = Math.abs(currentMiles - (prevAnimMilesRef.current || 0));

    // Scale duration: 1 second per 100 miles (10ms per mile)
    const msPerMile = 10;
    const durationMs = Math.max(500, Math.round(delta * msPerMile));

    gameProgressValue.value = withTiming(target, {
      duration: durationMs,
      easing: motion.easing.linear,
    });
    prevAnimMilesRef.current = currentMiles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miles, enabled, gameProgressValue, reduceMotionEnabled, ...extraDeps]);

  useAnimatedReaction(
    () => gameProgressValue.value,
    val => {
      runOnJS(setAnimatedProgress)(val);
    },
    [gameProgressValue],
  );

  return { gameProgressValue, animatedProgress } as const;
}
