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
  /**
   * Progress fraction (0..1) to jump to instantly on the *first* activation,
   * before animating up to the current-miles target. Should be the same
   * off-screen "reveal start" point the base/grey path is instantly drawn
   * to (see `findPathRevealStart` in MapScreen, and `completePathReveal`
   * in `useInitialAnimation`, which sets it fully drawn immediately on
   * welcome dismiss rather than animating it in) — without this, the
   * animation always started from progress 0 (Hobbiton), so for a
   * well-traveled save almost the entire catch-up animation played out
   * off-screen and only the last sliver was ever visible, flashing by
   * right as it finally entered the viewport. Defaults to 0, which
   * preserves the original behavior exactly (no-op) for early users where
   * there's nothing off-screen to skip.
   */
  revealStartProgress: number = 0,
) {
  const reduceMotionEnabled = useReduceMotion();
  const initialProgress =
    enabled && miles ? mapBookMilesToPathProgress(miles) : 0;
  const gameProgressValue = useSharedValue(initialProgress);
  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  const prevAnimMilesRef = useRef<number>(enabled ? miles || 0 : 0);
  // Tracks whether the first "catch up to current position" animation has
  // already played, so the off-screen jump-start only ever applies once —
  // subsequent updates (e.g. live step ticks) use the normal mile-scaled
  // duration from wherever the line currently is.
  const hasActivatedRef = useRef(false);
  // Time-throttling state for the UI-thread -> JS-thread progress bridge
  // (see the useAnimatedReaction below for why this exists). This is a
  // shared value, not a JS ref: the gate check itself runs on the UI
  // thread, inside the reaction, so that `runOnJS` is scheduled only when
  // it will actually result in a state update — not on every frame the
  // value changes. A JS-side ref would require calling runOnJS first to
  // even read/compare it, defeating the point of gating before the
  // cross-thread call.
  const JS_SYNC_THROTTLE_MS = 100; // ~10 checkpoint-state updates/sec
  const lastSyncAtShared = useSharedValue(0);

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
      hasActivatedRef.current = true;
      return;
    }

    const isFirstActivation = !hasActivatedRef.current;
    hasActivatedRef.current = true;

    if (isFirstActivation && revealStartProgress > 0) {
      // Instantly skip to the same off-screen point the grey path is
      // instantly drawn to (see useInitialAnimation's completePathReveal),
      // then only animate the (mostly on-screen) remaining distance up to
      // the current position. No explicit `easing` here — omitting it
      // uses Reanimated's default (Easing.inOut(Easing.quad)).
      //
      // Duration is scaled against `motion.pathReveal.duration` (the grey
      // path's old reveal-animation duration, kept only as a speed
      // reference now that the grey path itself no longer animates) as if
      // that duration still covered (1 - revealStartProgress) of the path
      // at some average progress-per-ms rate. This animation only needs
      // to cover (target - revealStartProgress) — a fraction of that
      // reference distance — so using the flat duration directly made it
      // crawl at a fraction of the intended speed. Measured on-device
      // (while the grey path still animated) at ~0.069 px/ms here vs
      // ~0.165 px/ms for the flat-duration reference over comparable path
      // geometry — moving noticeably slower makes the same underlying
      // path-curvature speed variation far more visually obvious (small
      // stalls read as "stopping" instead of blending into faster
      // continuous motion). Scaling the duration against the reference
      // speed removes that mismatch.
      const revealDistance = Math.max(1e-6, 1 - revealStartProgress);
      const catchUpDistance = Math.max(0, target - revealStartProgress);
      const scaledDuration = Math.max(
        500,
        Math.round(
          (catchUpDistance / revealDistance) * motion.pathReveal.duration,
        ),
      );

      gameProgressValue.value = revealStartProgress;
      gameProgressValue.value = withTiming(
        target,
        {
          duration: scaledDuration,
        },
        finished => {
          'worklet';
          // Guarantee JS sees the exact final value even if the
          // time-based throttle below swallowed the very last frame's
          // update — otherwise checkpoint activation (which reads
          // `animatedProgress` on the JS thread) could visibly lag a
          // hair behind the line's true resting position.
          if (finished) {
            runOnJS(setAnimatedProgress)(target);
          }
        },
      );
      prevAnimMilesRef.current = currentMiles;
      return;
    }

    const delta = Math.abs(currentMiles - (prevAnimMilesRef.current || 0));

    // Scale duration: 1 second per 100 miles (10ms per mile)
    const msPerMile = 10;
    const durationMs = Math.max(500, Math.round(delta * msPerMile));

    // Same reasoning as above: no explicit easing, so this matches the
    // grey path's default curve instead of a constant linear rate.
    gameProgressValue.value = withTiming(
      target,
      {
        duration: durationMs,
      },
      finished => {
        'worklet';
        if (finished) {
          runOnJS(setAnimatedProgress)(target);
        }
      },
    );
    prevAnimMilesRef.current = currentMiles;
  }, [
    miles,
    enabled,
    gameProgressValue,
    reduceMotionEnabled,
    revealStartProgress,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...extraDeps,
  ]);

  // `useAnimatedReaction`'s `react` callback fires on EVERY frame the
  // prepared value changes — it does not dedupe automatically. Bridging
  // the raw, continuously-changing `gameProgressValue` straight to JS on
  // every frame forced a full MapScreen/PointLayer re-render (which
  // re-sweeps every checkpoint/trivia point) each time. That per-frame
  // JS-thread work competed with the UI thread for frame time, causing
  // both visible choppiness in the Skia-drawn line AND intermittent
  // `RNSkia updateAndRelease() failed` errors during the animation.
  //
  // A pure progress-value quantization (rounding to a fixed step) still
  // produced near-every-frame updates whenever the animated range was
  // large relative to the step size. Throttling by wall-clock time
  // instead gives a predictable, low JS-thread update rate regardless of
  // how much progress the animation covers, while the `withTiming`
  // completion callbacks above guarantee the final value is always
  // delivered exactly, so checkpoint activation never visibly lags.
  //
  // The throttle gate itself runs here, on the UI thread, before ever
  // calling `runOnJS` — not inside the JS-side function `runOnJS`
  // schedules. An earlier version gated inside the JS function, which
  // meant `runOnJS` (a real cross-thread dispatch, not free) was still
  // scheduled on every single frame the animated value changed — up to
  // ~60/sec for a multi-second animation — even on frames the gate would
  // immediately discard. The base/grey path (`initialBasePathProgress` in
  // useInitialAnimation.ts) is set fully drawn immediately on welcome
  // dismiss rather than animated, so it has no JS bridge and no frame
  // budget to compete for at all; this path is the only one with a
  // per-frame cross-thread dispatch competing with the UI thread for its
  // own animation's frame budget. Gating before the dispatch, not just
  // before the resulting state write, removes that competition on every
  // discarded frame instead of only on the ~90% of frames whose JS-side
  // write was already a no-op.
  useAnimatedReaction(
    () => gameProgressValue.value,
    (value, previousValue) => {
      if (value === previousValue) return;
      const now = Date.now();
      if (now - lastSyncAtShared.value < JS_SYNC_THROTTLE_MS) return;
      lastSyncAtShared.value = now;
      runOnJS(setAnimatedProgress)(value);
    },
    [gameProgressValue],
  );

  return { gameProgressValue, animatedProgress } as const;
}
