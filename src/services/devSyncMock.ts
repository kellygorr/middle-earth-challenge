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

/**
 * Dev-only: force the splash screen to show "Upgrading" (instead of its
 * real `database.init()` result) so the upgrade-in-progress copy can be
 * visually reviewed without needing a real legacy database seeded on the
 * device first. See App.tsx's `isUpgrading` state, which checks this flag
 * (via `shouldForceUpgradeSplashForDev()` below) alongside the real
 * detection from `database.init()`'s return value.
 *
 * Flip to `true`, cold-restart the app (Fast Refresh is not enough since
 * this only takes effect during the bootstrap effect), observe the splash
 * screen, then set back to `false` and cold-restart again. Has no effect
 * outside `__DEV__` — a release build always uses the real detection.
 */
export const DEV_FORCE_UPGRADE_SPLASH = false;

export function shouldForceUpgradeSplashForDev(): boolean {
  return __DEV__ && DEV_FORCE_UPGRADE_SPLASH;
}

/**
 * Dev-only: force database.init() to throw during createTables(), as if a
 * real protected-upgrade migration failed partway through, so the
 * bootstrap error screen's upgrade-specific copy ("Upgrade could not
 * finish...") can be visually reviewed without needing to actually break
 * a real migration. See database.ts's createTables(), which checks this
 * flag (via shouldForceUpgradeMigrationFailureForDev() below) right after
 * setting `wasProtectedUpgrade` — matching the real code path where a
 * genuine migration failure is detected (isProtectedUpgrade was already
 * true before the failure), so App.tsx's
 * `database.wasProtectedUpgradeAttempt()` check also reports true here.
 *
 * Flip to `true`, cold-restart the app (Fast Refresh is not enough since
 * this only takes effect during the bootstrap effect), observe the
 * bootstrap error screen, then set back to `false` and cold-restart
 * again. Has no effect outside `__DEV__` — a release build never throws
 * this synthetic error.
 */
export const DEV_FORCE_UPGRADE_MIGRATION_FAILURE = false;

export function shouldForceUpgradeMigrationFailureForDev(): boolean {
  return __DEV__ && DEV_FORCE_UPGRADE_MIGRATION_FAILURE;
}

/**
 * Dev-only: inject a synthetic sync-error troubleshooting issue on launch
 * so the welcome screen's "Upgrade complete" card (see initializationStore's
 * `wasJustUpgraded`) can be visually reviewed alongside a REAL
 * troubleshooting issue card at the same time, without needing to wait for
 * or reproduce an actual sync failure. Does not touch the real sync
 * pipeline or persist anything beyond the normal troubleshooting-issue
 * flow (addTroubleshootingIssue is the same call a real sync failure would
 * make) — this is purely a test trigger, not a mock of sync itself.
 *
 * Flip to `true` alongside DEV_FORCE_UPGRADE_SPLASH, cold-restart the app,
 * observe the welcome screen, then set back to `false` and cold-restart
 * again. Has no effect outside `__DEV__`.
 */
export const DEV_FORCE_TEST_SYNC_ERROR = false;

export function shouldForceTestSyncErrorForDev(): boolean {
  return __DEV__ && DEV_FORCE_TEST_SYNC_ERROR;
}

/**
 * Dev-only: seed one synthetic troubleshooting issue per slot (see
 * constants/troubleshootingIssues.ts's doc comment — only one issue per
 * slot can be true at once, since within a subsystem later faults
 * supersede earlier ones) so Troubleshooting history and the home-screen
 * banner show the full range of card copy/colors/badges at once, without
 * needing to reproduce five different real failures. Picks one
 * representative `kind` per slot:
 *   - 'cross'      -> permission (source: 'both')
 *   - 'health-app'  -> timeout
 *   - 'pedometer'   -> pedometerServiceStopped
 *   - 'notice'      -> sourceFallback
 *   - 'app'         -> unknown
 * Does not touch the real sync pipeline or persist anything beyond the
 * normal troubleshooting-issue flow (addTroubleshootingIssue is the same
 * call a real sync failure would make) — this is purely a test trigger.
 */
export function addTestSyncErrorForDev(): void {
  const store = useProgressStore.getState();
  const now = Date.now();

  store.addTroubleshootingIssue({
    kind: 'permission',
    source: 'both',
    message: 'Both Health Connect and pedometer permissions were revoked.',
  });
  store.addTroubleshootingIssue({
    kind: 'timeout',
    chunkStart: now - 86400000,
    chunkEnd: now,
    chunksDone: 1,
    chunksTotal: 3,
  });
  store.addTroubleshootingIssue({
    kind: 'pedometerServiceStopped',
    lastCommitAt: now - 3 * 60 * 60 * 1000,
    staleForMs: 3 * 60 * 60 * 1000,
    manufacturer: 'Samsung',
  });
  store.addTroubleshootingIssue({
    kind: 'pedometerStorage',
    message: 'Failed to write pedometer data to local storage.',
  });
  store.addTroubleshootingIssue({
    kind: 'sourceFallback',
    unavailableSource: 'pedometer',
    activeSource: 'health-app',
  });
  store.addTroubleshootingIssue({
    kind: 'unknown',
    message: 'An unrecognized sync error occurred.',
  });
}

const DAYS = 10;
const MILES_PER_DAY = 2.5;
const CHUNK_DELAY_MS = 600;

// Install the mock fitness service at module import time so any sync that
// fires before initApp() awaits complete (useSyncInterval mounts before the
// init effect resolves) hits the mock instead of real Health Connect.
// Without this we race and the real provider throws a permission error,
// which trips the "disconnected" UX and disables sync.
if (__DEV__ && DEV_MOCK_LONG_SYNC) {
  setMockFitnessService(true);
  mockFitnessService.seedHistory(DAYS, MILES_PER_DAY);
  mockFitnessService.setArtificialDelay(CHUNK_DELAY_MS);
  mockFitnessService.setSimulateTimeout(false);
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
