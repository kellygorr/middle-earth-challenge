/**
 * Sync behavior constants.
 *
 * See docs/sync-improvements.md for rationale.
 */

export const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds between live syncs while foregrounded

// Pedometer mode uses a **watermark-based** commit strategy: each
// commit reads `getStepsBetween(lastSyncTimestamp, now)`, writes a
// single DistanceEntry (if steps > 0), then advances the watermark to
// `now`. Rows never overlap; their length is whatever window each
// commit covers. See docs/pedometer-mode.md § "Row model & commit
// strategy".

// Live: while the app is foregrounded, commit every 2 minutes. Each
// commit produces one row with ~2 minutes of walking captured. Keeps
// the Distance list feeling responsive without spamming SQLite.
export const PEDOMETER_LIVE_COMMIT_INTERVAL_MS = 2 * 60 * 1000;

// Background: WorkManager schedules 5 commits per day (~every 4.8h).
// Google's PeriodicWorkRequest minimum is 15 min, so this is well
// within limits; OEM battery managers may space it out further but
// each fired tick still commits a correct (variable-length) row.
export const PEDOMETER_BG_COMMIT_INTERVAL_MS = Math.floor(
  (24 * 60 * 60 * 1000) / 5,
);

// Display-only: the map screen refreshes its miles counter every 2s by
// reading the uncommitted-window step count and folding it into the
// displayed total. Nothing is written to SQLite on this cadence.
// Used by the map screen — NOT by the commit path.
export const PEDOMETER_DISPLAY_REFRESH_MS = 2 * 1000;

// Chunking
export const CHUNK_DAYS = 3;
export const CHUNK_TIMEOUT_MS = 20_000; // per-chunk native call timeout
export const CHUNK_RETRY_DELAY_MS = 1_000; // backoff before retry
export const CHUNK_YIELD_MS = 0; // microtask yield between chunks (UI paint)

// Long-sync escalation (pill -> overlay)
export const LONG_SYNC_CHUNK_THRESHOLD = 2; // chunks total > this -> overlay
export const LONG_SYNC_TIME_THRESHOLD_MS = 2_000; // elapsed > this -> overlay

// "Caught up!" dwell time at end of long sync
export const OVERLAY_DWELL_MS = 2_000;

// Heartbeat stall detection (no chunk progress)
export const STALL_WARN_MS = 15_000;
export const STALL_ERROR_MS = 45_000;

// Pill timings (existing behavior)
export const SYNC_MESSAGE_DURATION_MS = 5_000;
export const INITIAL_SYNC_MIN_DURATION_MS = 3_000;
