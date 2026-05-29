# Sync UX Improvements — Design Doc

Status: **Done**
Owner: TBD
Related code:

- [src/hooks/useSyncInterval.ts](../src/hooks/useSyncInterval.ts)
- [src/services/fitnessService.ts](../src/services/fitnessService.ts)
- [src/services/syncService.ts](../src/services/syncService.ts)
- [src/stores/progressStore.ts](../src/stores/progressStore.ts)
- [src/components/SyncIndicator.tsx](../src/components/SyncIndicator.tsx)
- [src/screens/MapScreen.tsx](../src/screens/MapScreen.tsx)

## Problem

When a user opens the app after a long gap (e.g. a month), sync ingests a huge window of Health Connect / HealthKit records in one shot. The UI shows only a small "Syncing miles..." pill while:

1. A single native query (`getDistanceRecordsSince`) blocks until **all** records resolve — often 10–30+ seconds for a month.
2. Nothing on the map indicates real progress.
3. The map miles only jump forward after the entire batch lands.
4. There's no ETA, no per-day feedback, no way to tell "still working" from "stuck".

For a daily user with a small gap, the current pill is fine. The pain is specifically the long-gap case.

## Goals

- Make long syncs feel **alive**: streaming progress, animated map advancement.
- Make long syncs feel **bounded**: an ETA once we have data.
- Keep the **daily-user** experience unchanged (no regression — no big overlay for a 1-second sync).
- Keep the app **interactive** throughout. Sync is informational, never blocking.
- Be **resumable**: an interrupted sync (app killed mid-month) should not refetch everything next launch.

## Non-Goals

- True background sync (`react-native-background-fetch`). Tracked as a follow-up.
- Changing how distance is computed or stored.
- Changing the daily/per-record sync model.

## Architecture Overview

### 1. Chunked streaming sync

Replace the single `getDistanceRecordsSince(monthAgo)` call with a loop that walks the date range in **N-day windows** (proposed default: **3 days**).

After each chunk:

1. Insert records into the DB (existing `addDistanceEntry` path).
2. Update `miles` in the store (already happens per-entry).
3. Update `syncStatus` (new) with `chunksDone`, `milesAddedSoFar`, etc.
4. Persist `lastSyncTimestamp` to the **end of that chunk** so a crash leaves us resumable.
5. Yield to React (`await new Promise(r => setTimeout(r, 0))`) so the UI can paint.

Direction: walk **forward from oldest → newest** so the map animates progress in the order the user actually walked it. This is visually intuitive ("watching yourself catch up").

#### Pseudocode

```ts
async function performChunkedSync(fromDate: Date, toDate: Date) {
  const chunks = buildChunks(fromDate, toDate, CHUNK_DAYS);
  setSyncStatus({
    phase: 'syncing',
    chunksDone: 0,
    chunksTotal: chunks.length,
    milesAdded: 0,
    startedAt: Date.now(),
  });

  for (const [i, chunk] of chunks.entries()) {
    const records = await fitnessService.getDistanceRecordsBetween(
      chunk.start,
      chunk.end,
    );
    const milesInChunk = await ingestRecords(records);

    setSyncStatus(prev => ({
      ...prev,
      chunksDone: i + 1,
      milesAdded: prev.milesAdded + milesInChunk,
    }));

    setLastSyncTimestamp(chunk.end.getTime());
    await yieldToUI();
  }

  setSyncStatus({ phase: 'idle' });
}
```

#### New fitness service method

Add `getDistanceRecordsBetween(start, end)` that mirrors `getDistanceRecordsSince` but accepts an end bound. Both platforms (HealthKit `getDailyDistanceWalkingRunningSamples` and Health Connect `readRecords` with `between`) already support a date range — just need to expose it.

### 2. Rich `syncStatus` state

Replace the current pair (`isSyncing: boolean`, `syncMessage: string | null`) in [progressStore.ts](../src/stores/progressStore.ts) with a discriminated union:

```ts
type SyncStatus =
  | { phase: 'idle' }
  | {
      phase: 'syncing';
      chunksDone: number;
      chunksTotal: number;
      milesAdded: number;
      startedAt: number; // epoch ms
    }
  | { phase: 'error'; message: string };
```

Derived selectors:

```ts
// Has the sync exceeded the "feels slow" threshold?
selectIsLongSync(): boolean // chunksTotal > 2 OR elapsed > 2000ms

// ETA in seconds (null until we have ≥1 completed chunk)
selectSyncEtaSeconds(): number | null

// Days remaining (display: "12 of 28 days synced")
selectSyncDayProgress(): { done: number; total: number } | null
```

**Note:** the app has no real user base yet (author-only), so we can replace `isSyncing` / `syncMessage` outright rather than keeping a compat shim. Update call sites in [SyncIndicator.tsx](../src/components/SyncIndicator.tsx), [useSyncInterval.ts](../src/hooks/useSyncInterval.ts), and anywhere else that reads the old fields in the same change.

### 3. Two-tier UI

#### Tier A — Pill (existing, unchanged)

[SyncIndicator.tsx](../src/components/SyncIndicator.tsx) keeps its current behavior. Shown for:

- Initial sync of a daily user (small gap)
- Live periodic syncs
- Any sync where `selectIsLongSync()` is false

#### Tier B — "Catching up" overlay (new)

A new component, `MapCatchingUpOverlay.tsx`, shown only when `selectIsLongSync()` is true. Layered on top of the map via the existing `syncIndicatorContainer` slot in [MapScreen.tsx](../src/screens/MapScreen.tsx).

**Visual:**

- Top band across the safe-area width (does NOT cover the whole map)
- Subtle parchment-toned background matching the theme
- Animated progress bar inside (gold gradient, matches checkpoint celebration palette)
- `pointerEvents="none"` — never blocks gestures

**Copy (proposed):**

| State                        | Text                                            |
| ---------------------------- | ----------------------------------------------- |
| Just started, no chunks done | "Catching up on your last 28 days…"             |
| Mid-sync, ETA known          | "Catching up — 12 of 28 days synced • ~8s left" |
| Final chunk landed           | "Caught up! +14.2 mi added" (fades after 2s)    |
| Error                        | "Sync paused. Tap to retry."                    |

Use plural-aware text (`day` vs. `days`). Round ETA to nearest 5s when > 30s, nearest second otherwise.

**Transitions:**

- Slide in from the top with fade (existing `useAnimatedModal` style timing).
- Slide out on success after 2s "Caught up!" dwell.

**A11y:** announce phase changes via `AccessibilityInfo.announceForAccessibility`.

### 4. Faster initial paint

Already mostly correct: `progressStore.initFromDatabase()` loads the snapshot before sync runs, so the map renders at last-known miles immediately. Verify the map doesn't gate on `isSyncing` anywhere.

The overlay layers on top — map is always visible, always interactive.

### 5. Resumable sync

Persist `lastSyncTimestamp` **after every chunk**, not just at the end. Today it's only persisted in the final `setLastSyncTimestamp(Date.now())` call.

Consequence: if the user kills the app mid-sync, the next launch picks up at the last completed chunk boundary, not all the way back at `syncStartDate`.

### 6. Failure, stall, and stuck-detection

The original failure mode was indistinguishable from a successful long sync: spinner shown indefinitely, no signal whether it was working, interrupted, or hung. We need explicit states for each case.

**What we already detect:** [useSyncInterval.ts](../src/hooks/useSyncInterval.ts) catches `SecurityException` / `permission` errors and shows a user-facing message ("It looks like your health data connection was disconnected…") then disables sync. That stays — it's the `kind: 'permission'` case below.

**What we don't detect today:**

- Native promise hangs (no throw, no resolution) — produces an infinite spinner. This was the original symptom.
- Native bridge errors that aren't permission-related — caught and logged but no UI feedback.
- Per-chunk failures (new in the chunked design).

#### Per-chunk timeout

Each `getDistanceRecordsBetween` call is wrapped in a timeout (proposed: **20s per chunk**). If a chunk fails to resolve in time:

1. Race the call against a timer; abandon the late resolution.
2. Retry that chunk **once** after a 1s backoff.
3. If the retry also times out, transition `syncStatus` to `phase: 'error'` with `kind: 'timeout'` and the chunk's date range.

#### Heartbeat detection (no progress in N seconds)

Independent of per-chunk timeout: if `chunksDone` doesn't advance for **15s**, the overlay flips to a "still working…" message. After **45s** with no progress, transition to `phase: 'error'` with `kind: 'stalled'`.

This catches native-side hangs that don't throw — the bridge can quietly stop pumping callbacks.

#### Error states + recovery UI

Replace the simple `error: string` shape with a richer error:

```ts
type SyncError =
  | {
      kind: 'timeout';
      chunkStart: number;
      chunkEnd: number;
      chunksDone: number;
      chunksTotal: number;
    }
  | {
      kind: 'stalled';
      chunksDone: number;
      chunksTotal: number;
      lastProgressAt: number;
    }
  | { kind: 'permission'; message: string }
  | { kind: 'unknown'; message: string };
```

Surfaced in the overlay (and in the pill for short syncs):

| Kind         | Overlay text                                                   | Action                                                                            |
| ------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `timeout`    | "Sync stuck on May 3–6. Tap to retry that batch."              | Retry chunk, then resume                                                          |
| `stalled`    | "Sync paused — Health Connect isn't responding. Tap to retry." | Resume from `lastSyncTimestamp` (which advances per chunk, so we don't redo work) |
| `permission` | Existing copy: "Your health data connection was disconnected…" | Open Settings to reconnect                                                        |
| `unknown`    | "Sync failed. Tap to retry."                                   | Resume                                                                            |

Tapping the error pill/overlay triggers `performSync(true)` again. Because `lastSyncTimestamp` is persisted per chunk, retrying picks up where it left off.

#### Manual retry from Settings

Add a "Sync now" button in Settings that:

- Disabled while `phase === 'syncing'`
- Shows last sync timestamp + last error kind if applicable
- Triggers a fresh `performSync(true)`

#### What the original failure would look like with this in place

- 0–2s: pill shows "Syncing miles…"
- 2s+: pill escalates to catching-up overlay with "Catching up on your last 30 days…"
- Every 3-day chunk lands: overlay updates "12 of 30 days synced • ~14s left", miles tick up on map
- If a chunk hangs: at 20s overlay shows "Sync stuck on May 3–6. Tap to retry that batch." — user knows it's broken vs. just slow
- After retry succeeds: resumes from chunk 5, finishes, "Caught up! +14.2 mi added"

### 7. Dev tooling

Add to the dev menu / `DevMiles` component:

- **"Force resync last N days"** — sets `lastSyncTimestamp` to N days ago and triggers a sync. Used for testing chunked behavior without waiting for real life to produce a gap.
- **"Throttle chunks"** — adds an artificial delay between chunks to verify overlay animation at slow speeds.
- **"Simulate chunk timeout"** — makes the next chunk throw a timeout, to verify error UI and retry flow.
- **"Simulate stall"** — makes chunks resolve but never advance, to verify heartbeat detection.

These are dev-only (gated by `__DEV__`).

## Threshold tuning

| Param                         | Proposed | Rationale                                                                                 |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `CHUNK_DAYS`                  | 3        | Balance between native call overhead and streaming smoothness. A 30-day sync = 10 chunks. |
| `LONG_SYNC_CHUNK_THRESHOLD`   | 2        | Don't show overlay for 1-chunk (≤3 day) syncs.                                            |
| `LONG_SYNC_TIME_THRESHOLD_MS` | 2000     | If first chunk takes >2s, escalate to overlay even if `chunksTotal` is small.             |
| `OVERLAY_DWELL_MS`            | 2000     | "Caught up!" fade-out delay.                                                              |
| `YIELD_MS`                    | 0        | Microtask yield between chunks.                                                           |

All overridable from a single `src/constants/sync.ts` constants file.

## Migration plan

1. **Replace `isSyncing` / `syncMessage` with `syncStatus`** in `progressStore`, update [SyncIndicator.tsx](../src/components/SyncIndicator.tsx) and [useSyncInterval.ts](../src/hooks/useSyncInterval.ts) to read the new shape. Clean cut — no compat shim needed (author-only userbase).
2. **Add `getDistanceRecordsBetween`** to `FitnessServiceInterface`, implement for iOS + Android. Tests with mock.
3. **Refactor `performSync`** in `useSyncInterval` into the chunked loop. `CHUNK_DAYS = 3` default.
4. **Add `MapCatchingUpOverlay`** + mount in `MapScreen`. Pill suppresses itself when `selectIsLongSync()` is true.
5. **Per-chunk `lastSyncTimestamp` persistence.**
6. **Dev tooling.**
7. **Manual test matrix** (below).

Each step is independently shippable.

## Test matrix

| Scenario                                           | Expected                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Fresh install, sync enabled, syncStartDate = today | Pill only, < 1s, no overlay                                     |
| 1-day gap                                          | Pill, no overlay                                                |
| 3-day gap                                          | Pill, no overlay (1 chunk)                                      |
| 7-day gap                                          | Overlay appears, ETA shown after first chunk, map miles tick up |
| 30-day gap                                         | Overlay with ETA, "Caught up!" on completion                    |
| Kill app mid-sync, reopen                          | Resumes from last chunk, not full re-fetch                      |
| Permission revoked mid-sync                        | Error phase, "Sync paused. Tap to retry."                       |
| Reduce Motion ON                                   | Overlay shows but progress bar uses opacity only (no shimmer)   |
| Live sync tick during overlay                      | Overlay continues, pill suppressed                              |

## Open questions

- Should the overlay live above or below the existing buttons/labels on the map? (Proposed: above the recenter button but below the settings button — needs UX call.)
- Should we expose "sync history" in settings (last N syncs with timing/miles)? Useful for debugging in the wild but scope creep here.
- iOS-only: HealthKit doesn't strictly guarantee record IDs are stable across queries; if dedup keys mismatch we could double-count. Existing code's `ah_${start}_${end}` fallback handles this, but worth verifying with a chunked workload.

## Out of scope (followups)

- `react-native-background-fetch` integration to keep gaps small. Currently a placeholder in [syncService.ts](../src/services/syncService.ts).
- iOS HKObserverQuery-based real-time updates (the current 10s poll is fine but not power-efficient).
- Sync conflict surface for user-edited entries.

## Other improvements

- ✅ Settings: “Reduced map titles” toggle renamed to **“Subtle map labels”** to communicate the visibility change rather than implying a size change.
- ✅ Settings: "Large labels" toggle replaced with a **Label size** segmented control (Small / Medium / Large) inline with the row label. Default is Medium; Large preserves the previous large size and Small is new. Legacy `'regular'` values coerce to `'medium'` on load.
- Stats page: "Make more progress to unlock stats". This page is boring. We should have the ui of what is normally there, and have this message over it so the user is more excited to unlock the stats. Also "Make more progress" is vague. How much progress do they need to make, what do they need to do to unlock
- ✅ Distance screen empty state: replaced the second-sentence "sync your health data from Settings" copy with the actual sync CTA from `TrackingOptions` (sync row only — `showAddOption={false}` `showDevToggle={false}`). Same component used on the first-checkpoint welcome.
- ✅ Whenever we refer to the in-app Settings screen we render the gear icon inline with the word "Settings" via the `<SettingsRef />` helper (nested `<View>` inside `<Text>` so it flows with surrounding copy and wraps naturally). Applied to: Distance empty state, Sync "Manage syncing" copy, Tracking options sync hint, and the permission-error message in WelcomeModal. OS-level "Settings" references are intentionally left as plain text.
- ✅ Developer settings panel now anchors flush to the bottom of the screen (respects safe-area inset) instead of floating with a gap above the home indicator. When the keyboard is open, it sits at `keyboardOffset` as before.
- ✅ Sync pill no longer overlaps the recenter / add-miles buttons when the map is shifted. The `syncIndicatorContainer` now reserves `spacing.xxxl` of horizontal padding so the centered pill stays inside the button gutter, and the pill content / text have `flexShrink: 1` so long messages (e.g. "Syncing miles · 2 of 8 · ~14s left") wrap or shrink instead of pushing past the buttons.
