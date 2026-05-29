# Sync Improvements — Test Plan

Status: **Draft**
Related: [sync-improvements.md](./sync-improvements.md)

This doc records how we plan to validate the chunked-streaming sync work in
[useSyncInterval.ts](../src/hooks/useSyncInterval.ts) end-to-end, both with
mocked fitness data (fast, deterministic) and against real HealthKit /
Health Connect (slow, environmental). It is intentionally focused on the
sync flow only — the cosmetic Stats/Settings/Button work tracked in the
parent doc is out of scope here.

## Background — the bug we're testing against

After ~2 months of not opening the app, the first launch would issue a single
`getDistanceRecordsSince(twoMonthsAgo)` call. That call blocked the JS
thread (no progress, no ETA), the UI looked frozen, and the only feedback
was the tiny "Syncing miles…" pill. Two compounding failures:

1. **Looks broken.** No streaming progress, no map advancement, no ETA. A
   user can't tell "still working" from "permanently stuck".
2. **Loses all progress on kill.** `lastSyncTimestamp` was only written
   after the entire 60-day batch landed. Force-quitting (which most users
   will do when an app appears frozen) meant the next launch started over
   from `syncStartDate` — zero progress preserved.

The chunked-sync work fixes both: every 3-day chunk paints UI, ticks miles
on the map, updates the ETA, and persists `lastSyncTimestamp`. So even a
user who kills the app halfway through resumes from the last completed
chunk on the next launch, and a user who waits sees real-time progress
instead of a frozen screen. **Validating those two properties — "doesn't
look frozen" and "kill-safe resume" — is the primary goal of this test
plan.**

## Goals

1. Prove every state of the chunked sync state machine renders the right UI.
2. Prove resume-from-last-chunk works after a mid-sync interruption.
3. Prove error paths (timeout, stall, permission, unknown) surface and recover.
4. Prove the daily-user case is unchanged (no overlay for a 1-chunk sync).
5. Prove the long-gap user case feels alive (overlay, ETA, ticking miles).

## What we already have

- **`MockFitnessService`** in [src/services/fitnessService.ts](../src/services/fitnessService.ts)
  with `seedHistory(days, milesPerDay, endDate)`, `setArtificialDelay(ms)`,
  `setSimulateTimeout(bool)`, and a runtime swap via `useMockFitnessService(true)`.
- **"Fake sync" button** in [src/components/DevMiles.tsx](../src/components/DevMiles.tsx)
  that flips `syncStatus` to a mid-progress synthetic state (chunks 2/8,
  backdated `startedAt`) — useful for previewing pill/overlay copy without
  touching the network, but it does **not** exercise the real loop.
- **Constants** in [src/constants/sync.ts](../src/constants/sync.ts) for
  chunk size, timeouts, stall thresholds, escalation thresholds.
- **`requestSyncNow()`** module-level handle exported by `useSyncInterval`
  so the dev panel can trigger a real sync without prop drilling.

## What's missing (test enablers we need to add)

These are not features — just hooks to make manual + automated testing
possible. They go behind `__DEV__`.

### Dev-panel additions (in `DevMiles.tsx`)

| Button                       | Behavior                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Use mock fitness**         | Toggle `useMockFitnessService(true/false)`. Shows current mode.                                                                                                                                        |
| **Seed N days**              | Text input for N (default 30). Calls `mockFitnessService.seedHistory(N)`. Also resets `lastSyncTimestamp` to N days ago and clears the relevant DB entries so the next sync actually walks all N days. |
| **Chunk delay**              | Text input ms. Calls `mockFitnessService.setArtificialDelay(ms)`. Makes each chunk take that long, so we can watch the overlay animate.                                                                |
| **Simulate next-chunk hang** | One-shot: arms `setSimulateTimeout(true)` and clears it after the first call. Drives the `kind: 'timeout'` error path.                                                                                 |
| **Simulate stall**           | Leaves `setSimulateTimeout(true)` permanently set until toggled off. Drives the stall path past `STALL_ERROR_MS`.                                                                                      |
| **Resync last N days**       | Sets `lastSyncTimestamp = Date.now() - N*MS_PER_DAY`, then `requestSyncNow()`. Doesn't require mock — works against real health data too.                                                              |
| **Clear last sync**          | Sets `lastSyncTimestamp = null`. Next sync will go back to `syncStartDate`.                                                                                                                            |

### Logging additions

- Per-chunk timing log in `useSyncInterval.performSync` (gated on `__DEV__`):
  `[sync] chunk i/N start=… end=… ms=… records=… milesAdded=…`. Already
  noted as a "possible next step" in `sync-improvements.md`.

### Optional: in-app sync-status overlay (debug)

A long-press on the sync pill (in `__DEV__`) opens a transient bottom-sheet
showing the live `syncStatus` JSON, `lastSyncTimestamp`, and provider. This
is purely for diagnosing odd states in real usage; lower priority than the
buttons above.

## Test scenarios

These map 1:1 onto the matrix in [sync-improvements.md](./sync-improvements.md#test-matrix)
but with concrete repro steps.

### S1 — Daily-user no-op sync (regression guard)

1. Mock on, `seedHistory(0)`, `Clear last sync` so `fromDate = syncStartDate = today`.
2. `Resync last N days = 1`.
3. Observe: pill appears briefly, no overlay, `syncStatus` returns to `idle`.

Pass: `selectIsLongSync()` stays false. No overlay frame painted.

### S2 — Single chunk, real-feeling

1. Mock on, `seedHistory(3, 2.5)`, `Resync last 3 days`, `Chunk delay = 0`.
2. Expect: 1 chunk, pill only, ~7.5 mi added, miles tick up on map.

### S3 — Multi-chunk, fast

1. Mock on, `seedHistory(15, 2.5)`, `Resync last 15 days`, `Chunk delay = 0`.
2. Expect: 5 chunks; whether overlay appears depends on
   `LONG_SYNC_CHUNK_THRESHOLD = 2`. Should escalate to overlay after chunk 1.
3. Map miles should advance 5 times, not once at the end.

### S4 — Multi-chunk, throttled (the visual demo)

1. Mock on, `seedHistory(30, 2.5)`, `Resync last 30 days`, `Chunk delay = 800`.
2. Expect: overlay appears almost immediately ("Catching up on your last 30 days…"),
   transitions to "Catching up — N of 10 chunks synced • ~Xs left" with a
   visibly shrinking ETA. Miles tick up on the map between chunks.
3. On completion: "Caught up! +75 mi added" dwells for `OVERLAY_DWELL_MS`.

This is the canonical "does it feel alive" run.

### S5 — Resume after kill mid-sync

1. Run S4. After ~3 chunks land (watch the dev log), force-kill the app.
2. Restart.
3. Expect: `lastSyncTimestamp` is at the end of chunk 3 (not the original
   `syncStartDate` or `Date.now()`). Next sync rebuilds chunks 4–10 only.

Pass: total miles added across both runs ≈ what a single 30-day run produced.

### S6 — Per-chunk timeout + retry

1. Mock on, `seedHistory(15)`, `Resync last 15 days`, `Chunk delay = 0`,
   **Simulate next-chunk hang** armed.
2. Expect: first chunk that hits the armed hang waits `CHUNK_TIMEOUT_MS`,
   retries once after `CHUNK_RETRY_DELAY_MS` (succeeds on retry), then
   continues. Overlay shows no error.

### S7 — Per-chunk timeout, both attempts fail

1. Same as S6 but keep `Simulate stall` on so retry also hangs.
2. Expect: after timeout + retry timeout, `syncStatus.phase = 'error'`
   with `kind: 'timeout'`, overlay shows
   "Sync stuck on May 3–6. Tap to retry that batch."
3. Toggle stall off, tap retry. Sync resumes from `lastSyncTimestamp`
   (the last completed chunk's end), not from scratch.

### S8 — Stall detection (no progress)

1. Mock on, `seedHistory(10)`, `Resync last 10 days`, **Simulate stall** on.
2. Expect: first chunk hangs past `STALL_ERROR_MS = 45_000`. State flips
   to `phase: 'error'` with `kind: 'stalled'` (or `'unknown'` depending on
   which guard fires first — we should pick one and stick with it).

### S9 — Permission error

This one needs the real fitness service (Health Connect can revoke; the
mock can't simulate `SecurityException` without extra plumbing).

1. Real service on, sync running.
2. In Android settings → Health Connect, revoke the app's distance permission.
3. Trigger a sync (`Resync last 1 day`).
4. Expect: `phase = 'error'` with `kind: 'permission'`, the existing
   "It looks like your health data connection was disconnected…" copy is
   shown, `syncEnabled` flips to false.

### S10 — Live tick during a long sync

1. Run S4 (throttled 30-day sync).
2. While the overlay is up, the live-sync interval would fire at
   `SYNC_INTERVAL_MS = 3min`. We don't normally hit this during a single
   test run, but the `inFlightRef` guard should make the live tick a no-op
   if it does fire. Optional: temporarily lower `SYNC_INTERVAL_MS` to 5s.
3. Pass: no duplicate ingestion, no `chunksTotal` reset, overlay stays.

## Unit tests worth writing

Cheap, deterministic, run in CI. All against `MockFitnessService`.

- `buildChunks(from, to)` (currently internal to `useSyncInterval`) —
  extract and test edge cases: from == to (0 chunks), from > to (0),
  exact multiple of CHUNK_DAYS, last chunk partial.
- `withTimeout(p, ms)` — resolves on win, rejects with `'chunk-timeout'`
  on loss, doesn't leak timers either way.
- `ingestRecords` dedup behavior — same record id seen twice across chunks
  doesn't double-count; only the most-recent record in a chunk can update;
  older diffs are preserved (matches the current code's "user-edited"
  rule).
- Selector tests on the store: `selectIsLongSync`, `selectSyncEtaSeconds`,
  `selectSyncDayProgress` against synthetic `syncStatus` shapes.

Component-level (snapshot or RTL):

- `SyncIndicator` renders correct copy for each `phase` / `error.kind`.
- `MapCatchingUpOverlay` renders progress %, ETA, "Caught up!" dwell.

## Open questions / risks

- `MockFitnessService.seedHistory` doesn't currently expose a way to
  seed records with **stable IDs across calls**. For the dedup test
  (S5 resume) we may need to make IDs deterministic per day so two
  separate chunked syncs of the same range produce the same set.
- `setSimulateTimeout(true)` uses a never-resolving promise. That's fine
  for `withTimeout` testing but means the mock can never recover until
  `setSimulateTimeout(false)` is called from outside the loop. We should
  verify the dev "armed for next call" semantics (one-shot vs sticky)
  actually clear themselves after one rejection.
- Real Health Connect on a fresh emulator returns 0 records, which makes
  S9 (permission revoke) the only meaningful real-service test we can
  reliably reproduce without a device that has step history.

## Out of scope

- iOS HKObserverQuery validation — current 10s poll is good enough; the
  parent doc lists it as a followup.
- `react-native-background-fetch` — placeholder only.
- Cosmetic regression of Stats / Settings / Button work — handled by the
  existing manual review listed in `sync-improvements.md`.
