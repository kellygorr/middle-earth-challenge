# Adversarial Code Review

Read-only review of the current codebase. Review one phase at a time, record
verified findings here, and report progress after every phase. Do not make code
changes during this review.

## Status

- [x] Phase 0: Create review tracker
- [x] Phase 1: Establish baseline
- [x] Phase 2: Progress and persistence
- [x] Phase 3: Health and pedometer sync
- [x] Phase 4: Friend sharing and Firebase
- [x] Phase 5: App lifecycle and concurrency
- [x] Phase 6: UI state and modal workflows
- [x] Phase 7: Native Android lifecycle
- [x] Phase 8: Tests and maintainability
- [x] Phase 9: Final triage report

## Process

For each phase:

1. Inspect only the named surface and its nearest tests/callers.
2. Record concrete risks with file references and evidence.
3. Classify each finding as Critical, High, Medium, or Low.
4. Note missing tests separately from confirmed bugs.
5. Run focused checks when they can confirm or reject a suspected issue.
6. Mark the phase complete and report the result before starting the next one.

## Review lenses

The first review asked only "is this code correct?", which is why it missed
several classes of problem entirely. Apply each of these to every phase, not
just the phases named after them.

**Should this exist?** Before reviewing whether a mechanism is implemented
correctly, ask whether it should be there at all. The first review filed three
separate findings against the `pendingEntries` staging buffer — a re-entrant
dismiss race, a rapid-tap hazard, and a dead navigation path — and never
questioned the buffer. It had no cancel path, so it bought nothing; deleting it
resolved all three at once. A cluster of findings around one mechanism is a
signal that the mechanism is the finding.

**Does the user find out?** Verifying that a failure sets state correctly is
not the same as verifying the user learns about it. Ask, for every failure
path: what does the user see, and how long until they see it? The first review
confirmed every error kind was recorded, and missed that `lastSyncError` is a
single slot that silently drops concurrent faults, and that a stalled pedometer
watermark is indistinguishable from a user who stopped walking.

**Is this written more than once?** Phases organised by subsystem find bugs
inside a component and structurally cannot see duplication across components.
Seven hand-assembled copies of the same icon-and-text row each looked fine
individually; the bug was that omitting one style name from one copy misaligned
it with no type error. Review component composition as its own surface.

**Does the name match the behaviour?** `ToggleRow` was being used for rows with
no toggle, which is how the duplication above went unnoticed — there _was_ a
component, it just did not look like it applied. Names that have drifted from
behaviour hide reuse and invite more duplication.

**Is the data model shaped like the problem?** A single-value field where the
domain permits several concurrent values is a design bug that reads as correct
code. Check cardinality against reality: can two of these be true at once?

## Phase 1: Establish baseline

- Record branch and working-tree state without modifying user changes.
- Run the full test suite, TypeScript, ESLint, and whitespace checks.
- Separate pre-existing failures from review findings.

## Phase 2: Progress and persistence

Review:

- `src/stores/progressStore.ts`
- `src/stores/statsStore.ts`
- `src/services/database.ts`
- Distance-entry creation, update, deletion, and snapshot consistency
- Migration and partial-write behavior

Focus: lost updates, stale snapshots, rollback gaps, numeric edge cases, and
measured-versus-derived step handling.

## Phase 3: Health and pedometer sync

Review:

- `src/hooks/useSyncInterval.ts`
- `src/services/fitnessService.ts`
- `src/services/pedometerCommit.ts`
- `src/services/dualSourceReconciliation.ts`
- `src/services/trackingModeService.ts`

Focus: duplicate ingestion, gaps, overlap, cursor advancement, source switching,
permission changes, midnight boundaries, and independent miles/steps handling.

## Phase 4: Friend sharing and Firebase

Review:

- `src/services/friendProgressService.ts`
- `src/services/friendProgressWorkflow.ts`
- `src/hooks/useFriendProgressSync.ts`
- `src/stores/friendProgressStore.ts`
- Firestore rules and debug/release isolation

Focus: privacy boundaries, anonymous identity, owner-only writes/deletes,
pending deletion, overlapping sync, quota assumptions, and stale participant
state.

## Phase 5: App lifecycle and concurrency

Review:

- App initialization and foreground/background transitions
- Timers, subscriptions, listeners, and cleanup
- Shared in-flight promises and re-entrancy guards
- Errors that silently leave persisted and in-memory state inconsistent

## Phase 6: UI state and modal workflows

Review:

- `src/stores/uiStore.ts`
- `src/screens/SharedModal.tsx`
- Settings, Sync, Distance, Data, and Friend Progress modal flows
- Pending edits/deletions and dismiss behavior

Focus: stale state, inaccessible hidden UI, accidental double actions, layout
regressions, and destructive-action recovery.

## Phase 7: Native Android lifecycle

Review:

- Foreground step-counter service
- WorkManager sweep
- Boot receiver
- Native bridge methods
- Permission and battery-management flows

Focus: restart loops, orphaned work, notification/service failures, process
death, permission revocation, and JS/native state disagreement.

## Phase 8: Tests and maintainability

Review:

- Missing high-value tests for confirmed behavior
- Brittle tests that assert implementation details
- Duplicated business rules or constants
- Public service APIs with unsafe or surprising contracts
- Complex code lacking rationale where it is needed

## Phase 9: Final triage report

Produce a findings-first report ordered by severity. Each finding must include:

- Severity
- User-visible or data-integrity impact
- File reference
- Evidence and triggering scenario
- Suggested fix
- Existing or missing test coverage

If a phase has no findings, say so and record the remaining risk.

## Backward-Compatibility Schema Baseline

This is the working persistence baseline for the compatibility pass. **LIVE**
means the shipped Android APK at
`android/app/build/outputs/apk/release/middle-earth-challenge.apk` (package
`com.middleearthchallenge`, version `1.1.3`, version code `18`, built July 29,
2026, SHA-256
`38ab11c556cd360ea51255fed7dff41ecbcf119e31092d81af3e7ee4b1e43b47`). Its
Hermes bundle was inspected directly. **NEW** means the current worktree under
review; it is not yet a released schema contract.

Both versions open the same SQLite database, `MiddleEarthSettings.db`, and use
the same default save ID. SQLite upgrades must therefore preserve existing rows
in place and be safe to rerun after an interrupted launch.

### LIVE: local SQLite schema

`user_settings` (one row per save ID):

| Column                           | Type/default                         |
| -------------------------------- | ------------------------------------ |
| `id`                             | `TEXT PRIMARY KEY`                   |
| `label_size`                     | `TEXT NOT NULL DEFAULT 'medium'`     |
| `text_size`                      | `TEXT NOT NULL DEFAULT 'medium'`     |
| `current_theme`                  | `TEXT NOT NULL DEFAULT 'minimalist'` |
| `show_checkpoint_labels`         | `INTEGER NOT NULL DEFAULT 1`         |
| `colorize_map`                   | `INTEGER NOT NULL DEFAULT 1`         |
| `reduced_map_titles`             | `INTEGER NOT NULL DEFAULT 1`         |
| `dev_mode`                       | `INTEGER NOT NULL DEFAULT 0`         |
| `use_miles`                      | `INTEGER NOT NULL DEFAULT 1`         |
| `sync_enabled`                   | `INTEGER NOT NULL DEFAULT 0`         |
| `sync_provider`                  | `TEXT NOT NULL DEFAULT 'none'`       |
| `sync_start_date`                | `INTEGER NULL`                       |
| `last_sync_timestamp`            | `INTEGER NULL`                       |
| `live_sync_enabled`              | `INTEGER NOT NULL DEFAULT 0`         |
| `tracking_mode`                  | `TEXT NOT NULL DEFAULT 'health-app'` |
| `has_seen_oem_battery_prompt`    | `INTEGER NOT NULL DEFAULT 0`         |
| `hc_revoke_pending_restart`      | `INTEGER NOT NULL DEFAULT 0`         |
| `last_notified_checkpoint_index` | `INTEGER NOT NULL DEFAULT -1`        |

`distance_entries`:

| Column    | Type/default                           |
| --------- | -------------------------------------- |
| `id`      | `TEXT PRIMARY KEY`                     |
| `save_id` | `TEXT NOT NULL`                        |
| `date`    | `INTEGER NOT NULL` (Unix milliseconds) |
| `miles`   | `REAL NOT NULL`                        |
| `steps`   | `INTEGER NOT NULL DEFAULT 0`           |
| `source`  | `TEXT NOT NULL DEFAULT 'manual'`       |

The LIVE database does not constrain `source` as an enum. The shipped bundle
recognizes legacy `manual`, new manual-mode values `manual-distance` and
`manual-steps`, plus `health-connect`, `apple-health`, and `pedometer`. Older
rows may also contain `synced`, so NEW must continue to tolerate that value.

`progress_snapshot` (one row per save ID):

| Column         | Type/default                 |
| -------------- | ---------------------------- |
| `id`           | `TEXT PRIMARY KEY`           |
| `miles`        | `REAL NOT NULL DEFAULT 0`    |
| `steps`        | `INTEGER NOT NULL DEFAULT 0` |
| `last_updated` | `INTEGER NOT NULL DEFAULT 0` |

The LIVE APK already stores miles and steps independently in both
`distance_entries` and `progress_snapshot`. Its legacy migration adds `steps`
where absent, derives entry steps from miles, and then populates snapshot steps
from the entry sum. Upgrading from LIVE is therefore not a miles-only data
migration.

LIVE has no Firebase user/friend collection and no local sharing fields. There
is no production sharing data to transform.

### NEW: current review schema

`distance_entries` is structurally unchanged. NEW expands accepted source
values with `health-reconciliation`; it also retains `synced` in the TypeScript
union for old rows. Source classification and deletion must remain compatible
with all LIVE values.

`user_settings` retains every LIVE column and adds:

| Column                            | Type/default                 | Purpose                           |
| --------------------------------- | ---------------------------- | --------------------------------- |
| `health_sync_format_version`      | `INTEGER NOT NULL`           | Health Connect entry-ID format    |
| `health_lookback_start_timestamp` | `INTEGER NULL`               | Earliest aggregate-safe replay    |
| `last_health_reconciled_through`  | `INTEGER NULL`               | Dual-source reconciliation cursor |
| `sharing_enabled`                 | `INTEGER NOT NULL DEFAULT 0` | Local Friend Progress opt-in      |
| `sharing_display_name`            | `TEXT NULL`                  | Published display name            |
| `sharing_affinity_selection`      | `TEXT NULL`                  | Published affinity                |
| `sharing_deletion_pending`        | `INTEGER NOT NULL DEFAULT 0` | Retry marker for cloud deletion   |
| `pedometer_cleanup_pending`       | `INTEGER NOT NULL DEFAULT 0` | Retry marker for native teardown  |
| `last_published_miles`            | `REAL NULL`                  | Last cloud-published distance     |
| `last_shared_progress_sync_at`    | `INTEGER NULL`               | Last sharing sync time            |

The defaults keep sharing off for every upgraded LIVE user. Existing LIVE rows
receive `health_sync_format_version = 0`; fresh NEW rows use version `1`.
Version `0` preserves LIVE raw Health Connect IDs until a final successful raw
sync atomically commits its entries, cursor, snapshot, and promotion to version
`1`. Interrupted cutovers therefore resume in raw mode without introducing
aggregate IDs for an already represented range.

`progress_snapshot` adds `cache_version INTEGER NOT NULL`. Existing LIVE rows
receive version `0`; fresh NEW rows use version `1`. NEW treats
`distance_entries` as the only source of truth and the snapshot as a rebuildable
cache. On the first upgraded hydration, version `0` causes NEW to sum persisted
entries and replace the LIVE snapshot with those totals and version `1` in one
transaction. Later launches read the versioned snapshot without repeating the
sum. A missing, invalid, or unversioned snapshot is rebuilt automatically.

The migration does not preserve a snapshot-only balance. This intentionally
means an entry that failed to persist in LIVE is not recovered merely because a
later snapshot captured its in-memory value. After migration, every entry
mutation and snapshot refresh occurs in one SQLite transaction, so NEW
snapshots remain aligned with persisted entries.

NEW also introduces Firestore collections `friend_progress` (release) and
`friend_progress_debug` (development), keyed by anonymous Firebase user ID:

| Field           | Type/constraint                                     |
| --------------- | --------------------------------------------------- |
| `displayName`   | non-empty string, at most 60 characters             |
| `affinity`      | `woodland`, `river`, `hills`, `coast`, or `cottage` |
| `distanceMiles` | number greater than or equal to 0                   |
| `updatedAt`     | server timestamp equal to request time              |

This cloud document is created only after opt-in. It is a new feature schema,
not a migration destination for LIVE local progress during app initialization.

## Backward-Compatibility Register

This register covers persisted data and first-run behavior from confirmed
Android LIVE `1.1.3` to NEW. Items marked **Open** require resolution or an
explicit release decision before shipping.

### Resolved: Health Connect record IDs change on upgrade

- Upgraded rows receive sync format version `0` and perform one final sync with
  the LIVE raw-record reader. Existing raw IDs therefore deduplicate normally,
  including when the cursor is null and the sync resumes from `sync_start_date`.
- Intermediate chunks commit entries and cursor while retaining version `0`.
  Only the final successful raw chunk promotes the row to aggregate format
  version `1`; an interrupted multi-chunk cutover resumes in raw mode.
- Health entries, the derived snapshot, `last_sync_timestamp`, and the format
  version are written in one transaction. A failed cursor/version write rolls
  back the chunk instead of exposing entries under an unadvanced checkpoint.
- Fresh NEW installs begin at version `1` and never perform the compatibility
  pass.
- **Status:** **Resolved and covered by raw-ID, null/stale cursor,
  interrupted/final chunk, migration-default, and rollback tests.**

### Resolved: Legacy distance source classification and deletion

- Manual data consistently includes `manual`, `manual-distance`, and
  `manual-steps`. Synced data consistently includes `synced`, `health-connect`,
  `apple-health`, `pedometer`, and `health-reconciliation`.
- Manage Data uses the same shared source groups for visibility and deletion,
  so upgraded rows cannot appear under one category and survive its deletion.
- Distance history uses the same exhaustive metadata for source captions, so
  legacy `synced` and NEW reconciliation rows no longer display as manual.
- Only `manual`, `manual-distance`, and `manual-steps` are manual. Any other
  current or future persisted source defaults to the synced category and the
  generic "Synced" label unless a provider-specific label is defined.
- **Status:** **Resolved and covered by focused source-category tests.**

### Resolved: Correctness-critical sync cursors

- Health-app chunks atomically commit entries, `last_sync_timestamp`, snapshot,
  and Health Connect format version.
- Pedometer foreground, Headless JS, mode-switch, and empty-window commits now
  atomically persist entries, snapshot, and `last_sync_timestamp` through the
  shared commit path. Cursor state is published to Zustand only after commit.
- Each dual-source reconciliation day atomically applies its top-up/removal,
  refreshes the snapshot, and advances `last_health_reconciled_through`.
- Cursor-only transitions use one awaited batched settings command for
  `sync_start_date`, `last_sync_timestamp`, and
  `last_health_reconciled_through`. This includes Android and iOS stop-sync
  flows and destructive data resets. Cleared bookmarks persist as SQLite
  `NULL`, not a zero sentinel.
- **Status:** **Resolved and covered by database rollback, service failure,
  empty-window, multi-day resume, and settings publication tests.**

### Resolved: Snapshot authority and one-time rebuild

- `distance_entries` is the only source of truth. `progress_snapshot` is a
  derived cache and never overrides entries.
- LIVE rows receive `cache_version = 0`. The first foreground or Headless JS
  hydration sums entries and writes cache version `1` in one transaction.
  Subsequent launches read the versioned cache without repeating the sum.
- Missing, invalid, or unversioned snapshots rebuild automatically. Every NEW
  entry mutation updates entries and snapshot in the same SQLite transaction;
  Zustand publishes only after commit.
- Snapshot-only LIVE values are intentionally discarded because they do not
  represent successfully persisted entries.
- **Status:** **Resolved and covered by initialization/durability tests.**

### Compatible: Additive settings and sharing defaults

- NEW settings columns are added idempotently. Existing settings retain their
  values; sharing fields default to off/null and the dual reconciliation cursor
  defaults to null.
- Existing `health-app` and `pedometer` tracking-mode values retain their
  meanings. `dual` is additive and is not selected automatically on upgrade.
- LIVE has no sharing database. Upgrade does not authenticate, publish progress,
  or create a Firestore document unless the user explicitly opts in.
- **Status:** **Compatible; retain fixture tests for defaults and no cloud write
  on upgrade.**

### Compatible: Native pedometer persistence

- The Android native pedometer database name/schema, SharedPreferences file and
  keys, service identifiers, and boot-recovery contracts are unchanged from
  LIVE. Existing samples, watermarks, and service intent remain readable.
- Foreground and Headless JS hydration both complete the snapshot migration
  before committing a new pedometer entry.
- **Status:** **Compatible; retain foreground/background upgrade smoke tests.**

### Compatible: Other persisted enums and checkpoint indices

- Theme names (`classic`, `minimalist`) and sync providers retain their stored
  values. The checkpoint list changed only a label position, so persisted
  `last_notified_checkpoint_index` values retain the same meaning.
- Database filename, default save ID, and miles/steps columns are unchanged.
  LIVE already stores independent miles and steps; no miles-only production
  conversion is needed for Android `1.1.3`.
- **Status:** **Compatible.**

### Audit boundary: iOS production artifact

The exact artifact inspection in this pass is Android-only. The JavaScript
SQLite schema is shared, but an iOS production build and HealthKit persisted-ID
behavior have not been independently fingerprinted. That audit remains required
before treating this register as the iOS release baseline.

## Executive Triage

The review confirmed **27 findings**: 14 High, 7 Medium, and 6 Low. No Critical
issue was confirmed. The clean baseline means these are behavioral and recovery
gaps not currently detected by the passing suite.

### Batch 1: Establish durable state boundaries

Fix first because later sync and sharing recovery depends on trustworthy local
state.

- [x] Make health-app, pedometer/background, and dual-reconciliation cursor
      writes awaited and atomic with their corresponding entry mutations.
- [x] Replace remaining non-cursor correctness-critical settings transitions
      with awaited, batched database commands, especially sharing lifecycle
      state. Cosmetic preference setters may remain fire-and-forget with
      centralized error handling.
- [x] Make distance-entry and progress-snapshot writes transactional; update
      Zustand only after commit and propagate failures.
- [x] Verify/repair snapshots from entries during hydration.
- [x] Add an initialization error/retry phase and make database initialization
      idempotent across foreground and Headless JS.

**Validation:** database/store failure-injection tests, concurrent init tests,
and App initialization failure tests.

### Batch 2: Close sync data-loss windows

- [x] Distinguish a successful empty health query from a provider failure.
- [x] Add a bounded health lookback for late-arriving records.
- [x] Preserve failed pedometer flush boundaries instead of resetting
      watermarks.
- [x] Track and retry failed native cleanup rather than reporting the source
      off.
- [x] Handle native sensor insert failures before advancing throttle state.

**Validation:** hook-level watermark tests, late-record tests, failed
mode-switch tests, and native step-database tests.

### Batch 3: Resolve release/privacy decisions

- [x] Configure Firebase Auth/Firestore for iOS before shipping Friend Progress
      there.
- [x] Decision: one global community is the product contract. Every install
      shares a single participant list; there is no group model, and the
      capability invites and membership-gated rules sketched in
      `docs/shared-progress.md` are deferred rather than required. Multi-group
      support can be added later without migrating existing documents, since
      membership would be additive fields on `friend_progress`.
      Accepted consequence: anyone holding the APK can read every participant's
      display name and distance. This is acceptable and permanent. The app will
      never be published to an app store, so distribution stays manual sideload
      to people who are handed the APK directly, and display names are
      user-chosen rather than legal names. The only trigger to revisit is the
      APK circulating beyond that group, which would show up as participants
      nobody recognizes.
- [x] Complete App Check enforcement and bounded/paginated participant reads:
  - [x] Initialize App Check before Firebase use with Play Integrity on Android
        and App Attest with DeviceCheck fallback on iOS.
  - [x] Cap participant pages at 50 and expose stable document-ID cursor
        pagination without changing the current single-page map behavior.
    - [x] Register the production Play Integrity, App Attest, and DeviceCheck
          fallback provider configs with the Android release SHA-256 and Apple
          Team ID.
    - [x] Configure Android for exclusive APK distribution outside Google Play:
          do not require `PLAY_RECOGNIZED` or `LICENSED`, and require
          `MEETS_DEVICE_INTEGRITY`.
    - [x] Accept the Play Integrity API terms and enable
          `playintegrity.googleapis.com` for Cloud project `648232041356`; no Play
          Console app or linking is required.
    - [x] Enable `firebaseappcheck.googleapis.com`, which is a separate API from
          Play Integrity. Device validation initially showed the client falling
          back to a placeholder token with a 403 until this was enabled.
    - [x] Validate production attestation on a physical Android device. The
          release build selected the `playIntegrity` provider with no debug
          token, Play Integrity returned a real attestation, and anonymous auth
          plus a Firestore write succeeded with no placeholder fallback.
    - [x] Metrics review is superseded: Friend Progress is unreleased, the
          shipped Android `1.1.3` uses no Firebase, and no iOS build exists, so
          the only Firestore client is the validated test device. The console
          reported 44% of requests from "outdated registered apps" at
          enforcement time; that figure is this device's own pre-registration
          failures, not a user population.
    - [x] Register a debug token for `com.middleearthchallenge.debug` so
          `__DEV__` builds using the debug provider are not rejected against
          `friend_progress_debug`. The debug variant signs with the project-local
          `android/app/debug.keystore`, and its Play Integrity registration must
          not require `PLAY_RECOGNIZED`.
    - [x] Enforce App Check for Cloud Firestore only; Authentication remains
          unenforced because anonymous sign-in must succeed before any Firestore
          call. Post-enforcement, the debug build's Firestore offline cache was
          deleted to force a server round trip: the cache rebuilt, the sharing
          sync advanced, and no `PERMISSION_DENIED` appeared.
    - [x] Re-verify one enable/stop sharing cycle under enforcement. Verified on
          the release build after fixing a delete race the cycle exposed:
          `deleteDoc` resolves once the mutation is queued locally on Android, so
          signing out immediately afterward destroyed the auth context before the
          delete reached the server and the row was stranded. Deletion now awaits
          `waitForPendingWrites()` before `signOut()`, and rethrows on failure so
          `sharingDeletionPending` survives for retry. Repeated enable/stop
          cycles now add and remove exactly one document with no residue.
- [x] Decision: leave the release signing passwords as they are. The original
      finding assumed exposure that does not exist here. The GitHub repository is
      private, `android/app/release.keystore` is gitignored and never committed,
      and the app is sideload-only, so the passwords are read only by local
      `assembleRelease` builds. Rotation was rejected because the off-machine
      backup stores the keystore and its password together by design, so
      changing the password would invalidate that recovery record without
      removing any real attack path. Moving the values to untracked Gradle
      properties remains optional tidiness, worth doing only if the repository is
      ever shared.

**Validation:** iOS startup/auth smoke test, Firestore emulator/rules tests,
abuse/quota tests, and release-signing CI verification.

### Batch 4: Repair user-facing correctness

- [x] Fix manual-source classification in Manage Data.
- [x] Add one-shot guards to SharedModal dismiss and EditEntry save/delete. The
      sharing enable path was also observed running twice concurrently on a
      single tap, writing the same document twice a millisecond apart, so this
      guard is needed beyond the modal surfaces. (Dismissal no longer needs a
      guard — the staging buffer it protected was removed.)
- [x] Replace the dead checkpoint-to-Distance return path with tested stack
      navigation.
- [x] Surface stale/offline Friend Progress state.
- [x] Fix DST calendar arithmetic in streaks and averages.

**Validation:** DataContent source tests, modal interaction tests, friend stale
state tests, and spring/fall DST tests.

### Batch 5: Hardening and cleanup

- [x] Add raw native sample retention/pruning.
- [x] Validate manual input and fetched Firestore rows at runtime.
- [x] Cancel deferred UI callbacks on unmount/orientation changes.
- [x] Remove dead modal/store APIs.
- [x] Add cross-layer affinity parity checks and update stale shared-progress
      docs.

**Validation:** long-run native storage tests, malformed-data tests, unmount
tests, and CI schema parity checks.

## Findings

### High: New manual entries cannot be deleted from Manage Data

- [x] **Resolved in Batch 4.** `src/constants/distanceSources.ts` defines
      `MANUAL_DISTANCE_SOURCES` plus `isManualDistanceSource` /
      `isSyncedDistanceSource`, so `manual`, `manual-distance`, and `manual-steps`
      classify identically everywhere.
- **Tests:** `src/constants/__tests__/distanceSources.test.ts`

### High: SQLite failures can leave memory, entries, and snapshots inconsistent

- [x] **Resolved in Batch 1.** Entry and snapshot mutations go through
      `applyDistanceEntryChanges`, which is serialized by `enqueueWrite` and wrapped
      in `runTransaction`, returns recalculated totals, and propagates failures.
      Zustand is updated only after the commit resolves.
- **Reinforced in Batch 4:** removing the pending-distance staging buffer also
  removed the last place that computed a total by arithmetic and wrote it over
  the database's authoritative value.

### Medium: Streaks and calendar-day averages break across daylight saving time

- [x] **Resolved.** Added `differenceInCalendarDays`, which rounds the gap
      between two local midnights, and used it for streak continuity, the
      today/yesterday check, and the inclusive `totalDays` count. The 24-hour
      constant is gone.
- **Testing note:** the first version of the DST tests passed against the
  unfixed code. Two reasons — the dates were wrong (the clocks move _during_
  2026-03-08, so the 23-hour gap is 03-08 → 03-09, not 03-07 → 03-08), and
  `process.env.TZ` set in `beforeAll` has no effect once the date cache is
  warm. Fixed by pinning the zone in `jest.globalSetup.js` and adding a
  precondition test asserting the 23h/25h gaps actually exist, so the suite
  fails loudly on a UTC machine instead of passing vacuously.
- **File:** `src/stores/statsStore.ts`, `src/stores/__tests__/statsStore.test.ts`

### Low: Manual entry inputs accept non-finite values

- [x] **Resolved.** Both entry points use `Number.isFinite` instead of `isNaN`.
      `isNaN` accepts `Infinity`, which `parseFloat('1e400')` produces, and an
      Infinity that reaches the database poisons every later total irrecoverably.
- **No upper bound was added.** Large distances are valid — a user who enters
  five million miles reaches Mordor, which is the intended outcome. The bug was
  the non-finite value, not the magnitude.
- **Files:** `src/components/Modals/Footers/MilesFooter.tsx`,
  `src/components/Modals/EditEntryModal.tsx`
- **Tests:** `EditEntryModal.test.tsx` covers `1e400` rejection and accepts a
  large real distance.
- **Open:** rejection is silent, with no user feedback. See `docs/TODO.md`.

### Resolved: Native provider failures are distinct from empty health reads

- Health Connect aggregate reads, the LIVE raw-reader cutover, and Apple Health
  daily reads return `[]` only when every required provider query succeeds with
  no activity. A failed distance or step signal rejects with a typed
  `HealthProviderReadError`; partial data is never committed as a complete
  chunk.
- The sync loop catches the rejection and retries the same chunk once. If the
  retry also fails, no entries or cursor are committed. The typed failure is
  classified as a persistent `provider` sync error instead of escaping the app
  or being hidden as an unknown error.
- Settings shows “Health sync failed,” explains that no date range was skipped,
  and provides the existing Sync Now retry action. Permission failures retain
  the reconnect guidance, and missing/outdated native providers retain the
  unavailable guidance.
- Android and iOS share this contract. The iOS artifact baseline remains a
  separate audit item, but Apple Health callback failures no longer advance its
  cursor.
- **Status:** **Resolved and covered by successful-empty, partial-read,
  raw-cutover, Apple Health, classification-precedence, and Settings-retention
  tests.**

### High: Health-only sync has no overlap for late-arriving activity

- **Status:** Resolved. Health-only sync re-queries an aligned three-day
  lookback, uses start-based stable aggregate IDs, and amends any matching
  persisted aggregate. A transactional replay floor prevents upgraded Android
  users from overlapping aggregate reads into ranges represented by LIVE raw
  record IDs.

- **Files:** `src/hooks/useSyncInterval.ts:212-220,315`,
  `src/constants/sync.ts:7-10`
- **Impact:** Each successful health sync advances the next query start exactly
  to the prior query end. Health Connect is explicitly batched and fitness apps
  can publish activity later with an earlier activity timestamp. Those delayed
  records fall behind the watermark and are never imported in health-only mode.
  Completed-day reconciliation covers dual mode only.
- **Suggested fix:** Re-query a bounded lookback window and rely on stable IDs
  plus amendment logic for deduplication, or reconcile recent completed days in
  health-only mode as well. Add a test where a record appears after the
  watermark with an earlier timestamp.

### High: Failed pedometer flushes are followed by destructive watermark resets

- **Status:** Resolved. Mode switches and explicit stop-sync actions await the
  final pedometer commit before changing mode or clearing sync state. A failed
  native read or SQLite commit rejects the transition, leaving the prior mode
  and watermark available for retry.

- **Files:** `src/services/trackingModeService.ts:94-118`,
  `src/components/Modals/Content/SyncContentAndroid.tsx:631-670`
- **Impact:** Switching away from pedometer or stopping sync catches and logs a
  failed final `commitPedometerRange`, then resets or clears the watermark and
  continues. Steps captured since the previous commit are no longer retryable
  and are silently lost.
- **Suggested fix:** Do not reset the watermark or finish the mode transition
  until the flush succeeds. If the user must be allowed to continue, persist a
  pending flush boundary and retry it before starting the new source.

### Resolved: Failed native stops can leave an orphan pedometer service

- Native stop intent is persisted with the source transition before teardown.
  The marker is cleared only after `stopTracking()` succeeds, so a rejected
  native call cannot be represented as completed cleanup.
- Cold start and every foreground resume retry pending cleanup before applying
  mode-specific reconciliation. Health-only mode no longer bypasses it.
- Persisted off-state is authoritative. If an upgraded install has an older,
  unmarked native service still running, reconciliation marks and stops the
  orphan instead of silently turning sync back on.
- The Android source toggle remains active while cleanup is pending, and an
  explicit stop action retries the same idempotent cleanup path.
- **Status:** **Resolved and covered by failed-stop, foreground-retry,
  write-before-publish, migration-default, and legacy-orphan tests.**

- **Files:** `src/services/trackingModeService.ts:171-181,224-232`,
  `src/components/Modals/Content/SyncContentAndroid.tsx:657-670`
- **Impact:** Native `stopTracking()` failures are logged and ignored after app
  state is changed. In health-only mode, startup reconciliation exits before
  checking the pedometer, so a still-running foreground service and reboot flag
  can remain orphaned. When stopping without changing the saved mode,
  reconciliation can instead flip `syncEnabled` back on because it trusts the
  still-running service.
- **Suggested fix:** Treat native stop as part of the transition result. Keep a
  cleanup-pending state, retry on startup/resume regardless of selected mode,
  and do not report the source as stopped until native cleanup succeeds.

### High: "Friends" data is globally enumerable and easy to quota-amplify

- **Status:** Resolved by decision, mitigation, and production verification.
  Global visibility is now an explicit product decision: the app serves a single
  community, so `allow read: if request.auth != null` is the intended contract
  and the private-group design is deferred. The quota-amplification half is
  mitigated: App Check is initialized with Play Integrity on Android and App
  Attest with DeviceCheck fallback on Apple, enforcement is on for Cloud
  Firestore, and participant reads are capped at 50 per request with stable
  document-ID cursor pagination. Real-device attestation passed for the release
  build via Play Integrity and for the debug build via a registered debug token.
  An enable/stop sharing cycle also passed under enforcement. iOS has never
  shipped, so enforcement is not gated on iOS; App Attest must be verified
  before any future iOS release.
  Residual accepted risk: App Check authenticates the app binary, not the
  viewer, so anyone who obtains the APK can still read the full participant
  list. That is the intended sharing model at this audience size.

- **Files:** `firestore.rules:4-15`,
  `src/services/friendProgressService.ts:18,84-111`,
  `docs/shared-progress.md:52-54,188-194`
- **Impact:** Without the mitigation, any party could use the public Firebase
  configuration to create an anonymous account, then page through every
  production participant. Private groups and membership-gated rules are
  designed but not implemented. The user-facing "friends" set remains the
  global opted-in set by product decision; enforced App Check now limits
  scripted access to attested app instances.
- **Suggested fix:** Decide whether global community visibility is truly the
  product contract. For friends-only privacy, add group/invite membership to
  documents and rules. Independently enable App Check, cap/paginate reads, and
  monitor or constrain anonymous-account abuse.

### High: Sharing transitions are not durably recoverable after partial local writes

- **Status:** Resolved. Sharing upserts and deletion now persist explicit
  provisioning/deletion intent through one awaited settings command before
  cloud mutation, finalize locally only after cloud success, and retry pending
  phases during startup synchronization.

- **Files:** `src/services/friendProgressWorkflow.ts:43-63,81-96`,
  `src/stores/settingsStore.ts:187-214`
- **Impact:** Opt-in creates the cloud row before six independent local setting
  writes; opt-out persists `sharingEnabled=false` and the deletion marker in
  separate writes before deleting. A local DB failure or process death between
  those operations can leave a visible cloud row while the next launch believes
  sharing is off and no deletion is pending, so ordinary sync/retry stops.
- **Suggested fix:** Persist sharing state changes through one transactional
  settings operation with explicit provisioning/deletion phases. On startup,
  reconcile those phases against the current anonymous UID/document before
  deciding that sharing is fully off or on.

### High: Firebase sharing was not configured for iOS

- **Status:** Resolved. The production iOS Firebase app is configured before
  React Native startup, Auth and Firestore are linked through CocoaPods, and the
  Release target selects its production plist explicitly. An unsigned arm64
  Release simulator build completed successfully, and the packaged app was
  verified to contain project `middle-earth-challenge`, bundle
  `com.middleearthchallenge`, and Google app ID
  `1:648232041356:ios:8b26b2a0eb7a669bd734a9`.
- **Files:** `ios/MiddleEarthChallenge/AppDelegate.swift`,
  `ios/Firebase/Release/GoogleService-Info.plist`,
  `ios/MiddleEarthChallenge.xcodeproj/project.pbxproj`, `ios/Podfile`
- **Remaining validation:** Exercise anonymous authentication and a Firestore
  operation on a physical iOS device before enabling the feature for release.
  Deferred: no iOS device is currently available, so this configuration remains
  build-verified only.

### Medium: Failed friend fetches leave stale map data with no visible state

- [x] **Resolved.** `friendProgressStore` now records `lastFetchedAt` on every
      successful fetch and leaves it untouched on failure, so cached participants
      can be reported with their real age. `FriendProgressContent` shows "Updated
      Xm ago" normally and "Couldn't refresh — showing positions from Xm ago" when
      `fetchError` is set with cached rows present, falling back to "Couldn't load
      friend progress" when there is nothing cached.
- **Files:** `src/stores/friendProgressStore.ts`,
  `src/components/Modals/Content/FriendProgressContent.tsx`
- **Tests:** `src/stores/__tests__/friendProgressStore.test.ts` covers cache
  retention plus an unchanged `lastFetchedAt` across a failed refresh.

### Low: Firestore participant rows are trusted without runtime validation

- [x] **Resolved.** `parseParticipantDocument` validates affinity against
      `FRIEND_AFFINITIES`, requires a non-blank string name, and requires a finite
      non-negative distance. Invalid rows are skipped with a warning instead of
      being rendered.
- **Paging subtlety:** `nextCursor` is still derived from documents _read_, not
  documents _kept_, so a page consisting entirely of malformed rows still
  advances rather than stalling the cursor.
- **File:** `src/services/friendProgressService.ts`
- **Tests:** `friendProgressService.test.ts` covers each rejected field plus the
  accepted shape.

### High: Initialization failures still transition the app to ready

- [x] **Resolved in Batch 1.** `App.tsx` tracks `bootstrapStatus` as
      `'loading' | 'ready' | 'error'`; a hydration failure sets `'error'` and renders
      an alert with a Retry button instead of falling through to `ready`. The splash
      is no longer hidden unconditionally in a `finally`.

### Medium: Foreground Headless JS can reinitialize an already-open database

- [x] **Resolved in Batch 1.** `database.init()` shares a single in-flight
      `initPromise` and returns it to concurrent callers, so a headless task firing
      while the app is foregrounded reuses the existing initialization rather than
      reopening the handle and repeating migrations.
- **File:** `src/services/database.ts`

### Low: Deferred UI work is not cancelled on unmount

- [x] **Resolved.** The Distance pagination timeout is held in a ref and
      cleared on unmount. `useTooltipPositioning` now captures and cancels its
      animation frame, and guards the `measureInWindow` callback with a mounted
      token — that callback resolves natively, so cancelling the frame alone does
      not stop it.
- **Also collapsed** the hook's two near-identical effects into one. They both
  measured on `showTooltip`, so every dimension change ran the measurement
  twice.
- **Files:** `src/components/Modals/Content/DistanceContent.tsx`,
  `src/hooks/useTooltipPositioning.ts`

### High: Modal dismissal is re-entrant and can commit pending entries twice

- [x] **Resolved at the root.** The `pendingEntries` / `pendingDeletions`
      staging buffer was removed entirely. Adding, editing, and deleting distance
      now write straight to SQLite via `applyDistanceEntryChanges`, which is already
      serialized (`enqueueWrite`), transactional, and returns the recalculated
      miles/steps. Dismissal no longer commits anything, so there is nothing to
      commit twice and no dismiss lock is needed.
- **Note:** the buffer had no cancel path — every exit committed — so it was a
  batch-write mechanism with no user-visible benefit. It also recomputed the
  total arithmetically (`baseMiles + pendingTotal - deletionTotal`) and
  persisted that over the authoritative DB value, which could drift.
- **Files:** `src/stores/uiStore.ts`, `src/screens/SharedModal.tsx`,
  `src/components/Modals/Footers/MilesFooter.tsx`,
  `src/components/Modals/EditEntryModal.tsx`,
  `src/components/Modals/Content/DistanceContent.tsx`

### Medium: Checkpoint-to-Distance return navigation is dead code

- [x] **Resolved.** TrackingOptions now pushes `{ type: 'miles' }` onto the
      modal stack instead of dismissing the checkpoint, so `canGoBack` renders the
      Back chevron and closing Distance returns to the checkpoint that launched it.
      The unused `returnTo` / `setReturnTo` / `navigateBack` / `ReturnToContext`
      path was removed, along with the now-orphaned `closeAllModalsWithCallback` /
      `consumeDismissCallback` machinery and the circular-import `require()` it
      forced inside `useAnimatedModal`.
- **Follow-on found while fixing:** `handleBack` popped without committing
  pending distance rows, which would have stranded them until the whole stack
  closed. The commit was extracted into `commitPendingDistance()` and is now
  shared by dismiss and back, both under the same one-shot lock. Covered by
  `src/screens/__tests__/SharedModal.test.tsx`.
- **Files:** `src/components/TrackingOptions.tsx`,
  `src/components/Modals/Content/InfoContent.tsx`, `src/stores/uiStore.ts`,
  `src/hooks/useAnimatedModal.ts`, `src/screens/SharedModal.tsx`

### Medium: Edit save/delete actions are not protected from rapid repeat taps

- [x] **Resolved.** `actionLockRef` guards save and delete, and with the staging
      buffer gone a repeated save is an idempotent upsert on the same row id rather
      than an append to two parallel arrays. Covered by
      `src/components/Modals/__tests__/EditEntryModal.test.tsx`.

### Low: Exit-animation callbacks have no unmount/orientation ownership guard

- [x] **Resolved.** `useAnimatedModal` cancels the queued entrance frame and
      all three animations on unmount, and `handleExitComplete` returns early when
      the instance is gone. `SharedModalInner` is keyed by orientation, so rotating
      mid-animation unmounts the instance while a Reanimated completion is still
      pending.
- **File:** `src/hooks/useAnimatedModal.ts`
- **Not covered by tests:** rotation-during-animation needs a device or a
  Reanimated timing harness neither of which exists here.

### Low: Release signing passwords are committed in repository history

- **Status:** Downgraded from High and accepted. Severity was assigned before
  the distribution model was established. The repository is private, the
  keystore is gitignored and has never been committed, and the app is never
  published to a store, so the passwords only unlock a file that exists on the
  build machine and in one private backup. Rotation was explicitly rejected: the
  backup deliberately stores the keystore and password together for
  recoverability, and losing the key permanently prevents updating existing
  installs, which is a far more likely and more damaging outcome than credential
  theft. Revisit only if the repository becomes public or is shared.

- **File:** `android/app/build.gradle:96-101`
- **Impact:** The release keystore and key passwords are hard-coded in a tracked
  file and have been present in Git history since commit `47414e9`. The keystore
  itself is ignored, which limits immediate exposure, but anyone who later gains
  the keystore (backup, artifact, shared machine) already has its credentials.
  Password rotation also requires a source change.
- **Suggested fix:** Rotate the keystore passwords if feasible, load all release
  signing values from untracked Gradle properties or CI secrets, and remove the
  plaintext values from current source. Treat history as already disclosed.

### High: Native step-sample storage grows without retention or compaction

- [x] **Resolved.** Added `StepCounterDbHelper.pruneSamplesBefore(cutoffMs)`,
      exposed as `PedometerModule.pruneSamplesBefore` and called from
      `commitPedometerRange` after the watermark advances, with a 7-day retention
      margin (`PEDOMETER_SAMPLE_RETENTION_MS`).
- **Anchor preservation is the subtle part:** `readStepsBetween` derives a
  window's starting count from the newest sample _before_ the window. Deleting
  that row would make the next window report every step since boot, so the
  prune keeps the latest pre-cutoff sample per `boot_id` and deletes in a
  transaction.
- **Pruning is best-effort:** a failure is logged and swallowed, because the
  only consequence is a larger table and it must not fail a committed window.
- **Files:** `StepCounterDbHelper.kt`, `PedometerModule.kt`,
  `src/services/pedometerService.ts`, `src/services/pedometerCommit.ts`,
  `src/constants/sync.ts`

### Resolved: Sensor sample persistence failures are not handled reliably

- Native inserts use `insertOrThrow`, so SQLite failures cannot masquerade as
  successful samples.
- Throttle state advances only after the insert succeeds. A failed write keeps
  the prior count and timestamp, making the next sensor event immediately
  retryable instead of suppressing it for up to ten seconds or five steps.
- The sensor callback catches and logs storage exceptions rather than allowing
  them to escape the service looper. The latest failure is exposed through the
  native environment snapshot and cleared by the next successful due sample.
- Foreground reconciliation publishes a persistent Pedometer storage error and
  clears that specific error after native recovery without disabling tracking.
- **Status:** **Resolved and covered by native failed-write retry/throttle tests
  and JS failure/recovery reconciliation tests.**

- **Files:**
  `android/app/src/main/java/com/middleearthchallenge/pedometer/StepCounterDbHelper.kt:55-68`,
  `android/app/src/main/java/com/middleearthchallenge/pedometer/StepCounterService.kt:193-202`
- **Impact:** `SQLiteDatabase.insert()` can return `-1` without throwing, but
  `insertSample()` discards the result. Exceptions from opening/writing the DB
  are also not caught in `onSensorChanged`. The service can advance its throttle
  state after a failed insert or allow a storage exception to escape the sensor
  callback, losing samples or destabilizing the foreground service without a
  recoverable status.
- **Suggested fix:** Use `insertOrThrow` or check the row ID, update
  `lastCount/lastWriteMs` only after confirmed persistence, catch/report storage
  failures, and expose a health signal that JS can surface or retry.

### High: Tests stop before the highest-risk integration boundaries

- [x] **Closed; remaining work tracked in `docs/TODO.md`.** The suite is now 27
      files / 257 tests, up from 16 / 170. Added since the review: modal
      double-action and navigation tests (`SharedModal`, `EditEntryModal`,
      `FriendProgressContent`), spring/fall DST tests, friend-participant
      validation tests, pedometer sample-pruning tests, and cross-layer affinity
      parity tests.
- **Three gaps remain, each with its own TODO entry** rather than being carried
  in this document:
  1. No transactional database failure-recovery tests — the sync and commit
     suites still mock the store and database.
  2. `App.test.tsx` renders an almost-empty tree and asserts nothing
     meaningful.
  3. No `androidTest` target, so `pruneSamplesBefore`'s anchor-preservation SQL
     is unverified.
- **Note:** the interaction tests added here mock the stores, so they prove the
  right calls happen with the right payloads, not that persistence agrees.

### High: Settings setters promise immediate success while persistence is fire-and-forget

- [x] **Resolved in Batch 1 for correctness-critical state.** The sharing
      lifecycle, cursor, and mode-transition setters now return `Promise<void>` and
      await `database.updateUserSettings`, batching related fields into one update.
- **Deliberately unchanged:** cosmetic preference setters (theme, units) remain
  fire-and-forget, which was the Batch 1 decision rather than an oversight.
- **File:** `src/stores/settingsStore.ts`

### Low: Legacy modal state and navigation remain in public stores

- [x] **Resolved.** Removed `showSettings`, `showStats`, `showSyncModal` and
      their setters from `uiStore`. (`navigateBack()` and the `returnTo` path went
      with the Phase 6 navigation fix.) The modal stack is now the only navigation
      API.
- **Larger than reported:** the finding cited four lines in `mapStore.ts`, but
  `useMapStore` had no importers at all — the whole store was unreachable,
  including map transform, path animation, and selection state. Deleted.
- **Files:** `src/stores/uiStore.ts`, `src/stores/mapStore.ts` (deleted)

### Low: Cross-layer schema and feature contracts can drift silently

- [x] **Resolved.** `src/constants/__tests__/friendAffinities.test.ts` parses
      `firestore.rules` and `scripts/seed-firebase-debug-users.mjs` and compares
      both against `FRIEND_AFFINITIES`, plus checks the participant field list the
      rules require. Verified by temporarily renaming an affinity in the rules —
      the test failed, then passed again once restored.
- **Doc corrected.** `docs/shared-progress.md` now separates shipped behavior
  from deferred design: the invite-only group model is marked not built and not
  planned (superseded by the single-community decision), and the three
  unimplemented cadence triggers — background-transition publish, pedometer
  background publish, and pull-to-refresh — are labelled as such rather than
  described as current behavior.
- **Tooling:** `tsconfig.json` now includes the `node` types so a test can read
  repo files. `@types/node` was already present transitively; no dependency was
  added.

## Review Log

### Phase 0

Created this tracker so review progress is visible and resumable.

### Phase 1

Baseline established on `feature/dual-tracking-sources`:

- Branch is one commit ahead of `origin/feature/dual-tracking-sources`.
- Existing feature work is staged; the review did not alter staging.
- Full Jest suite: 170 tests passed, 0 failed.
- TypeScript: `npx tsc --noEmit` passed.
- ESLint: `npm run lint` passed.
- Whitespace: `git diff --check` passed.

No pre-existing executable-check failures need to be separated from later
review findings.

### Phase 2

Reviewed progressStore, SQLite schema and operations, pending modal commits,
stats aggregation, input boundaries, and nearest tests.

- Confirmed four findings: two High, one Medium, and one Low.
- Verified the DST issue with an executable timezone check.
- No tests currently exercise DataContent source classification or database
  failure recovery.
- Rejected as separate findings: the unused stats `progressPercentage` value,
  deterministic first-entry behavior for tied best days, and migration syntax
  errors (non-duplicate migration errors correctly rethrow).

### Phase 3

Reviewed health adapters, chunk ingestion, pedometer commits, mode transitions,
dual-source reconciliation, background sweeps, watermarks, and focused tests.

- Focused sync suites: 47 tests passed, 0 failed.
- Confirmed four findings: three High and one Medium.
- Missing tests at review time included transient provider failure versus
  legitimate empty data; that boundary is now covered. Late-arriving health
  records, failed mode-switch/stop flushes, and failed native service cleanup
  are now covered.
- Rejected as findings: dual reconciliation's local-midnight half-open ranges
  are DST-safe; pedometer and reconciliation are serialized by one in-flight
  guard; repeated current aggregate IDs are intentionally amendable; independent
  miles/steps top-ups are implemented; deriving a missing signal when only one
  health aggregate is available matches the product rule.

### Phase 4

Reviewed Firebase Auth/Firestore service and rules, collection isolation,
sharing workflow, deletion retries, polling, participant caching, map rendering,
seed behavior, platform setup, and focused tests.

- Focused sharing suites: 21 tests passed, 0 failed.
- Confirmed five findings: three High, one Medium, and one Low.
- Rejected as findings: deletion is correctly ordered before sign-out; failed
  deletes retain the same anonymous session and a persisted retry marker; the
  in-flight promise prevents simultaneous duplicate cycles; debug and release
  use separate collections; server timestamps and owner-only writes are enforced
  correctly by the checked-in rules.
- Accepted/documented limitation: reinstall can abandon an anonymous row. This
  remains separate from the partial local-persistence finding above.

### Phase 5

Reviewed cold-start sequencing, store hydration, AppState listeners, periodic
timers, module-level sync callbacks, headless-task coexistence, animation timers,
and cleanup behavior.

- App smoke test: 1 passed, 0 failed.
- Confirmed three findings: one High, one Medium, and one Low.
- Deferred SharedModal/useAnimatedModal callback ownership to Phase 6 because it
  depends on modal navigation semantics rather than general app lifecycle.
- Rejected as findings: sync hooks are gated until initialization phase changes;
  settings, progress, dev setup, and tracking reconciliation are awaited in the
  intended order; active sync callback replacement uses identity-safe cleanup;
  friend sync does not mutate progress entries; celebration timers and primary
  AppState/interval subscriptions clean up correctly.

### Phase 6

Reviewed modal stack navigation, close/back/home flows, pending edit commits,
nested edit modal behavior, settings/sync/data/friend content actions,
accessibility state, and animation callbacks.

- App smoke test: 1 passed, 0 failed.
- Confirmed four findings: one High, two Medium, and one Low.
- No SharedModal, uiStore modal-navigation, EditEntryModal interaction, or
  destructive-flow tests currently exist.
- Rejected as findings: the module-level Friend Progress affinity draft is an
  intentional session behavior; Generate remaining available was explicitly
  requested; Delete All intentionally preserves a pending cloud-deletion marker
  while completing local deletion; celebration timers clean up on item change;
  StatusBadge hidden accessibility handling is correct.

### Phase 7

Reviewed the Android manifest, native module, foreground step service, raw
sample database, WorkManager worker, Headless JS bridge, boot receiver, release
build configuration, and device scheduler state.

- Native Kotlin compilation and debug manifest processing passed.
- No native JVM or instrumentation tests exist under `android/app/src/test` or
  `android/app/src/androidTest`.
- Confirmed three findings: two High and one Medium.
- The connected Pixel shows the periodic WorkManager job registered with prior
  successful executions. The Worker-to-Headless-service handoff remains a
  portability risk under Android background-service policy, but is not recorded
  as a confirmed failure because the persistent step foreground service keeps
  the app in a foreground state during expected operation and local execution
  history is successful.
- Rejected as findings: sensor callbacks are serialized on their registration
  looper; the permission/startForeground race is already caught; service and
  receiver components are non-exported or protected appropriately; ProGuard is
  currently disabled; WorkManager `Result.success()` is an intentional
  watermark-recovery policy; lack of locked-boot support is explicitly accepted.

  ### Phase 8

  Inventoried 16 Jest files / 170 passing tests, mapped them to confirmed review
  findings, and reviewed store/service contracts, dead APIs, duplicated schema
  rules, and documentation drift.

  - Full coverage run: 170 tests passed, 0 failed.
  - Confirmed four leverage findings: two High and two Low.
  - Existing strengths: pure stride/chunk/checkpoint selectors, reconciliation,
    pedometer commits, milestone notification behavior, and Firebase workflow
    happy/error paths have focused tests with useful behavioral assertions.
  - Existing tests should remain; the priority is adding integration boundaries,
    not replacing sound unit coverage.

  ### Phase 9

  Consolidated 27 findings into five remediation batches ordered by dependency and
  user risk. No production code was changed during the review.
