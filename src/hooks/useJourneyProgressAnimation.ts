import { useEffect, useRef, useState } from 'react';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { motion } from '../styles/motion';

export function useJourneyProgressAnimation(
  miles: number | undefined,
  extraDeps: any[] = [],
) {
  const initialProgress = miles ? mapBookMilesToPathProgress(miles) : 0;
  const journeyProgressValue = useSharedValue(initialProgress);
  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  const prevAnimMilesRef = useRef<number>(miles || 0);

  useEffect(() => {
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

    journeyProgressValue.value = withTiming(target, {
      duration: durationMs,
      easing: easingCurve,
    });
    prevAnimMilesRef.current = currentMiles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miles, journeyProgressValue, ...extraDeps]);

  useAnimatedReaction(
    () => journeyProgressValue.value,
    val => {
      runOnJS(setAnimatedProgress)(val);
    },
    [journeyProgressValue],
  );

  return { journeyProgressValue, animatedProgress } as const;
}
