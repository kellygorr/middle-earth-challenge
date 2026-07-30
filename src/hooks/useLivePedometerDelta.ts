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
 * Poll cadence is 2 seconds while mounted. Also refreshes when the app
 * returns to the foreground so the chip is accurate after a
 * background/foreground round-trip.
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { pedometerService } from '../services/pedometerService';
import { useSettingsStore } from '../stores/settingsStore';

const POLL_INTERVAL_MS = 2000;

export function useLivePedometerDelta(): number {
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const [liveDelta, setLiveDelta] = useState(0);

  useEffect(() => {
    if (
      (trackingMode !== 'pedometer' && trackingMode !== 'dual') ||
      !pedometerService.isSupported()
    ) {
      setLiveDelta(0);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      if (!lastSyncTimestamp) {
        if (!cancelled) setLiveDelta(0);
        return;
      }
      try {
        const window = await pedometerService.getStepsBetween(
          lastSyncTimestamp,
          Date.now(),
        );
        // Re-check after the await — the hook may have unmounted or the
        // effect re-run while we were waiting on the native module. Without
        // this guard React warns about setting state on an unmounted
        // component (and we'd briefly show a stale value from the previous
        // deps just before the new effect runs).
        if (cancelled) return;
        setLiveDelta(window.steps);
      } catch {
        // Swallow: transient pedometer read failures shouldn't disrupt
        // the UI. Keep the previous value so counters don't flicker.
      }
    };

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [trackingMode, lastSyncTimestamp]);

  return liveDelta;
}
