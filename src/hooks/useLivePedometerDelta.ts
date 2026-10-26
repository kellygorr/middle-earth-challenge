/**
 * useLivePedometerDelta — poll the pedometer for the OPEN step range
 * since the last committed sync watermark.
 *
 * This is the "not yet persisted to SQLite" slice: pedometer commits
 * every ~2 minutes (see `PEDOMETER_LIVE_COMMIT_INTERVAL_MS`), and this
 * hook surfaces the drift between those commits so UI (map-screen
 * chip, distance-screen live row) can tick up in real time.
 *
 * Returns 0 when:
 *   - Tracking mode is not pedometer
 *   - Pedometer is not supported on this device
 *   - There is no `lastSyncTimestamp` yet (fresh install / just switched
 *     modes) — there's no meaningful "since when" to measure against
 *
 * One app-level owner polls while pedometer-backed tracking is active.
 * Consumers only select the shared value, so mounting another screen cannot
 * create another native request loop.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { PEDOMETER_DISPLAY_REFRESH_MS } from '../constants/sync';
import { pedometerService } from '../services/pedometerService';
import { useSettingsStore } from '../stores/settingsStore';

interface LivePedometerDeltaState {
  steps: number;
  setSteps: (steps: number) => void;
}

export const useLivePedometerDeltaStore = create<LivePedometerDeltaState>(
  set => ({
    steps: 0,
    setSteps: steps => set({ steps }),
  }),
);

export function useLivePedometerDelta(): number {
  return useLivePedometerDeltaStore(state => state.steps);
}

export function useLivePedometerDeltaOwner(): void {
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const pedometerCursor = useSettingsStore(state => state.pedometerCursor);
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<{ steps: number }> | null>(null);

  useEffect(() => {
    const generation = ++generationRef.current;
    const setSteps = useLivePedometerDeltaStore.getState().setSteps;
    if (
      (trackingMode !== 'pedometer' && trackingMode !== 'dual') ||
      !pedometerService.isSupported()
    ) {
      setSteps(0);
      return;
    }

    const refresh = async () => {
      if (inFlightRef.current) return;
      if (!lastSyncTimestamp && !pedometerCursor) {
        setSteps(0);
        return;
      }

      let request: Promise<{ steps: number }> | null = null;
      try {
        request = pedometerCursor
          ? pedometerService.getStepsSinceCursor(pedometerCursor)
          : pedometerService.getStepsBetween(
              lastSyncTimestamp as number,
              Date.now(),
            );
        inFlightRef.current = request;
        const window = await request;
        if (generation === generationRef.current) setSteps(window.steps);
      } catch {
        // Swallow: transient pedometer read failures shouldn't disrupt
        // the UI. Keep the previous value so counters don't flicker.
      } finally {
        if (request && inFlightRef.current === request) {
          inFlightRef.current = null;
        }
      }
    };

    refresh();
    const interval = setInterval(refresh, PEDOMETER_DISPLAY_REFRESH_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });

    return () => {
      generationRef.current += 1;
      // Reset the in-flight guard too, not just the generation counter. If
      // the native read this effect started never settles, refresh()'s own
      // finally (which clears the guard) never runs, and since inFlightRef
      // persists across this hook's effect re-runs, a stuck old request
      // would silently block every future refresh() forever — even after a
      // mode switch spins up a brand-new interval. A stale resolution of
      // the abandoned request is already harmless: its own finally checks
      // identity before touching inFlightRef, and the generation check
      // above already prevents it from writing a stale steps value.
      inFlightRef.current = null;
      clearInterval(interval);
      sub.remove();
    };
  }, [trackingMode, lastSyncTimestamp, pedometerCursor]);
}
