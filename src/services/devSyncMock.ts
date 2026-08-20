import { Platform } from 'react-native';
import { mockFitnessService, setMockFitnessService } from './fitnessService';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';

/**
 * Dev-only: simulate a returning Android user with a long gap so the very
 * first sync of the launch exercises the full chunked-sync experience
 * (pill -> overlay -> ETA -> "Caught up!").
 *
 * Flip `DEV_MOCK_LONG_SYNC` to true, restart the app (full reload, not just
 * Fast Refresh), and the next cold start will:
 *   1. Reset progress (miles, distance entries, sync state).
 *   2. Swap to the in-memory MockFitnessService seeded with N days of
 *      Health-Connect-shaped data (80-200 small samples per day — the
 *      realistic Android stress case). iOS pre-aggregates to 1 record/day
 *      so it's not modeled separately.
 *   3. Throttle each chunk by `CHUNK_DELAY_MS` so the overlay animates at
 *      human-readable speed.
 *   4. Set syncStartDate to N days ago so `useSyncInterval` builds
 *      ceil(N / CHUNK_DAYS) chunks.
 *
 * Set back to false (and reload) to return to real Health Connect.
 */
// ⚠️ Keep this `false` for normal development and all release builds — the
// app will use real Health Connect / Apple Health data.
// Set to `true` only when you want to test the chunked-sync UX with seeded
// mock data, then cold-restart the app (Fast Refresh is not enough).
// The `setMockFitnessService()` helper is `__DEV__`-guarded, so even if this
// were left `true` a release build cannot swap in the mock.
export const DEV_MOCK_LONG_SYNC = false;

const DAYS = 10;
const MILES_PER_DAY = 2.5;
const CHUNK_DELAY_MS = 600;

// Install the mock fitness service at module import time so any sync that
// fires before initApp() awaits complete (useSyncInterval mounts before the
// init effect resolves) hits the mock instead of real Health Connect.
// Without this we race and the real provider throws a permission error,
// which trips the "disconnected" UX and disables sync.
console.log('[devSyncMock] module evaluated', {
  __DEV__,
  DEV_MOCK_LONG_SYNC,
});
if (__DEV__ && DEV_MOCK_LONG_SYNC) {
  setMockFitnessService(true);
  mockFitnessService.seedHistory(DAYS, MILES_PER_DAY);
  mockFitnessService.setArtificialDelay(CHUNK_DELAY_MS);
  mockFitnessService.setSimulateTimeout(false);
  console.log('[devSyncMock] mock installed at import time');
}

export async function setupDevMockLongSyncIfEnabled(): Promise<void> {
  if (!__DEV__ || !DEV_MOCK_LONG_SYNC) return;

  // Wipe miles/entries/sync state so the seeded chunks re-ingest cleanly.
  await useProgressStore.getState().resetProgress();

  const settings = useSettingsStore.getState();
  await settings.updateSyncSettings({
    lastSyncTimestamp: null,
    syncStartDate: Date.now() - DAYS * 24 * 60 * 60 * 1000,
    ...(settings.syncProvider === 'none'
      ? {
          syncProvider:
            Platform.OS === 'ios' ? 'apple-health' : 'health-connect',
        }
      : {}),
    ...(!settings.syncEnabled ? { syncEnabled: true } : {}),
  });

  // Install mock data source. Android-shaped (many small samples per day).
  setMockFitnessService(true);
  mockFitnessService.seedHistory(DAYS, MILES_PER_DAY);
  mockFitnessService.setArtificialDelay(CHUNK_DELAY_MS);
  mockFitnessService.setSimulateTimeout(false);

  console.log(
    `[devSyncMock] armed: ${DAYS}d @ ${MILES_PER_DAY} mi/day, ${CHUNK_DELAY_MS}ms/chunk`,
  );
}
