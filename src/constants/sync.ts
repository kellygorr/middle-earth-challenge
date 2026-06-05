/**
 * Sync behavior constants.
 *
 * See docs/sync-improvements.md for rationale.
 */

export const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes between live syncs

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
