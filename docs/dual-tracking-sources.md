# Dual Tracking Sources

## Status

Implementation in progress. Android first because the direct pedometer is not
implemented on iOS.

This document extends `docs/pedometer-mode.md`. That document's mutually
exclusive-source assumption remains true for the released implementation but
will no longer apply when dual tracking is enabled.

## Goal

Allow the direct phone pedometer and Health Connect to be active together
without double counting:

- The pedometer provides immediate progress during the current day.
- Health Connect fills gaps after a day is complete, covering activity recorded
  by a watch, ring, or other device when the phone was not present.
- Manual entries are never included in source reconciliation.

The Android Sync modal presents one independent switch per source. Either
source can run alone; enabling both selects dual mode.

## Core invariant

For each completed local calendar day:

```text
credited tracked distance = max(existing tracked distance, Health Connect distance)
health top-up = max(Health Connect distance - existing tracked distance, 0)
```

The app retains the day's existing tracked entries and stores only the
difference as a replaceable Health Connect reconciliation entry. Normally the
existing tracked distance is entirely pedometer data. On the day a user changes
from Health Connect-only to dual mode, it is the Health Connect entries before
the switch plus pedometer entries after the switch. Manual and prior
reconciliation entries are excluded.

Health Connect Steps and Distance must be read through its aggregate API. The
aggregate API applies Health Connect's Activity-app priority and deduplicates
overlapping records from sources such as a phone, Garmin, or Oura. The app then
uses the larger walking equivalent of the aggregated Steps and Distance
signals.

## Reconciliation timing

Dual mode does not reconcile the current day.

During the current day, the pedometer behaves exactly as it does now:

- native continuous step collection;
- immediate on-screen progress;
- two-minute entry commits while the app is active;
- tail-window commit when the app backgrounds;
- native background collection and later catch-up.

When the app next opens or returns to the foreground, it reconciles every
completed day after the reconciliation cursor through yesterday. No midnight
background job is required because mobile scheduling cannot guarantee one.
The app does not request Health Connect background-read permission; foreground
catch-up is the only reconciliation trigger.

Example: if the app remains closed for seven days, the next foreground session
reconciles all seven completed days in chronological order.

Health Connect-only mode keeps its existing foreground and live-sync behavior.
Completed-day reconciliation applies only while both sources are selected.

## Reconciliation cursor

Persist one dedicated cursor:

```ts
lastHealthReconciledThrough: number | null;
```

The cursor is an exclusive timestamp boundary at local midnight. After
successfully reconciling yesterday, its value is the start of today.

Rules:

- Enabling dual mode sets the cursor to the start of today.
- Reapproving Health Connect permission sets the cursor to the start of today.
- A successful daily reconciliation advances it to the next local midnight.
- A failed daily reconciliation does not advance it.
- Days are processed oldest to newest, advancing after each successful day so a
  later failure does not repeat earlier work.
- Disabling dual mode or removing either source permission clears it to `null`.
- Re-enabling dual mode initializes it to the start of that day.

No separate `dualTrackingEnabledAt` or permission-gap field is needed. The
cursor represents both the lower boundary and reconciliation progress.

## Permission semantics

Health Connect permission revocation is a user-data boundary, not a temporary
sync outage.

- Stop Health Connect reconciliation when permission is revoked.
- Continue pedometer tracking if its permission remains granted.
- Clear `lastHealthReconciledThrough` to `null`.
- On reapproval, set `lastHealthReconciledThrough` to the start of today.

That reset permanently skips completed days during the revoked period. Today
becomes eligible for normal reconciliation tomorrow.

If pedometer permission is revoked while Health Connect remains available, the
app exits dual mode, clears the cursor, and continues in Health Connect-only
mode. If Health Connect permission is revoked, the app exits dual mode, clears
the cursor, and continues in pedometer-only mode.

Permission loss while the app is closed is detected on the next app open or
foreground return. The app checks both sources before changing state:

- Pedometer unavailable and Health Connect granted: switch to Health
  Connect-only and show a persistent "Switched to Health Connect" advisory.
- Health Connect revoked and pedometer available: switch to pedometer-only and
  show a persistent "Switched to Pedometer" advisory.
- Both unavailable: disable automatic tracking, leave neither source selected,
  and show a persistent "Automatic tracking stopped" permission error.
- Health Connect grant state cannot be queried: preserve dual mode and retry
  later rather than treating a transient API failure as revocation.

All three actionable banners include a **Sync settings** button that opens the
Sync modal. They do not suggest resetting progress because existing progress is
retained. No system notification is sent while the app is closed; detecting
Health Connect revocation there would require the background-read permission
that dual mode intentionally does not request.

## Daily entry model

Add a reconciliation source to `DistanceSource`, for example:

```ts
'health-reconciliation';
```

Store at most one reconciliation entry per local date with a stable ID:

```text
health_reconciliation_YYYY-MM-DD
```

The entry contains only the top-up miles and corresponding derived steps. An
upsert replaces an earlier calculation; a zero top-up removes any existing row.
The operation must be idempotent.

Manual, manual-distance, and manual-steps entries remain additive and are
excluded from both sides of the comparison.

Existing Health Connect and pedometer entries from before dual mode remain
historical progress and are not retroactively reconciled.

## Daily reconciliation algorithm

For each eligible completed local day:

1. Build the exact `[local midnight, next local midnight)` interval.
2. Query Health Connect aggregate Steps and aggregate Distance for the interval.
3. Convert both to miles and choose the larger walking equivalent.
4. Sum existing Health Connect, Apple Health, and pedometer entries assigned to
   that interval, excluding manual and reconciliation entries.
5. Calculate `max(healthMiles - pedometerMiles, 0)`.
6. Upsert or remove the stable reconciliation entry.
7. Recalculate total miles and steps from all entries.
8. Persist the progress snapshot.
9. Advance `lastHealthReconciledThrough` to the interval end.

The cursor advances only after the entry and progress snapshot succeed.

## Midnight correctness

Pedometer commit ranges may span local midnight, especially after a background
sweep. `commitPedometerRange` must split such ranges at every local-midnight
boundary and query/write one segment per day. A midpoint timestamp on one
multi-day row is not accurate enough for daily reconciliation.

Day boundaries must use local calendar time and naturally handle 23-hour and
25-hour daylight-saving days rather than assuming every day is 24 hours.

## Source transitions

The source switches map directly to tracking mode:

- Both off: automatic tracking disabled.
- Pedometer on: pedometer-only mode.
- Health Connect on: Health Connect-only mode.
- Both on: dual mode.

Turning one switch off in dual mode leaves the other source running. Turning
on a source retains the existing permission flow for that source.

### Pedometer only to dual

- Keep existing pedometer entries.
- Grant/verify Health Connect access.
- Set the reconciliation cursor to the start of today.
- Do not run the normal additive Health Connect ingestion path in dual mode.

### Health Connect only to dual

- Stop normal additive Health Connect ingestion.
- Keep completed historical Health Connect entries.
- Start/verify the pedometer.
- Set the reconciliation cursor to the start of today.
- Reconcile the transition day after it ends. Its baseline is the existing
  Health Connect entries before the switch plus pedometer entries after it, so
  only genuinely additional Health Connect distance is added.

### Dual to one source

- Flush any pending pedometer tail before stopping the pedometer.
- Stop creating reconciliation entries.
- Preserve historical entries.
- Initialize the remaining source's own cursor without importing overlapping
  history.

## Source bookkeeping

The existing shared `lastSyncTimestamp` cannot coordinate two active sources.
In dual mode it remains the pedometer commit watermark because additive Health
Connect ingestion is stopped. One dedicated cursor coordinates completed-day
Health Connect reconciliation:

```ts
lastHealthReconciledThrough: number | null;
```

Health Connect-only mode continues using the existing additive-sync
bookkeeping. No second dual-mode cursor or enablement timestamp is needed.

## Failure behavior

- Health Connect query failure: retain pedometer progress and cursor; retry the
  failed day on the next eligible run.
- Pedometer read failure: do not fabricate a row or advance its watermark unless
  the existing pedometer retry policy explicitly permits it.
- App termination during reconciliation: stable IDs and per-day cursor updates
  make the next run safe.
- Health aggregate lower than pedometer: remove any top-up and credit the
  pedometer total.
- Both tracked totals zero: store no reconciliation row but advance the cursor
  after the successful comparison.
- Manual entries: remain untouched regardless of either tracked total.

## Implementation order

1. Add persisted independent cursors and database migration.
2. Split pedometer commit ranges at local midnight.
3. Add the reconciliation source and daily top-up service.
4. Add completed-day orchestration and cursor advancement.
5. Implement permission and source-transition behavior.
6. Integrate foreground and manual sync triggers.
7. Add UI controls and source-status presentation.

## Required tests

- Health aggregate exceeds pedometer and creates only the difference.
- Pedometer exceeds Health Connect and creates no top-up.
- Re-running a day is idempotent.
- Existing top-up is replaced or removed when inputs change.
- Manual entries do not affect reconciliation.
- A seven-day absence processes all seven completed days in order.
- Failure on day four leaves the cursor after day three.
- Reapproval resets the cursor to the start of today and skips completed revoked
  days.
- Pedometer windows split correctly across midnight and daylight-saving changes.
- Health-only, pedometer-only, dual, and each transition avoid overlapping
  entries.
- A Health Connect-only to dual transition reconciles the switch day against
  its combined pre-switch health and post-switch pedometer baseline.
