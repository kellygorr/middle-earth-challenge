# Adversarial Code Review 2

Conduct a read-only, evidence-driven review of the clean commit recorded in
Phase 1. Treat the first adversarial review as historical context, not proof that
a surface is correct. Focus on regressions, incomplete remediation,
cross-feature interactions, and previously unexamined boundaries. Do not modify
production code until final findings have been reviewed and prioritized.

The first review remains the historical record and compatibility baseline:
`docs/adversarial-code-review.md`. This review starts from its resolved findings
and looks for regressions, incomplete fixes, cross-feature interactions, and
risks introduced by the cleanup.

## Status

- [x] Phase 0: Create review tracker
- [x] Phase 1: Establish baseline
- [x] Phase 2: Persistence and transactional integrity
- [x] Phase 3: Health, pedometer, and source reconciliation
- [x] Phase 4: App lifecycle, concurrency, and native boundaries
- [x] Phase 5: iOS readiness and platform parity
- [x] Phase 6: Friend sharing, Firebase, privacy, and release configuration
- [x] Phase 7: UI workflows, map behavior, and accessibility
- [x] Phase 8: Architecture, DRY, performance, and dead code
- [x] Phase 9: Test quality and missing failure coverage
- [x] Phase 10: Final triage report

## Review Rules

1. Inspect the owning implementation, its nearest callers, and relevant tests.
2. Prefer executable evidence over speculation. Run focused checks when they can
   confirm or reject a suspected issue.
3. Record confirmed defects separately from missing tests and maintainability
   opportunities.
4. Label each candidate `Confirmed` or `Needs validation`. Unverified suspicion
   must not appear in final triage as a defect.
5. Every defect must include severity, impact, triggering scenario, evidence,
   file references, suggested direction, and current test coverage.
6. Group symptoms with one underlying cause into one finding.
7. Do not report style preferences as defects. A DRY finding requires plausible
   behavioral drift, duplicated business rules, or repeated bug-prone wiring.
8. Do not reopen a resolved first-review finding without evidence of regression
   or an incomplete boundary.
9. Do not modify production code during this review. Remediation happens only
   after final triage and explicit prioritization.
10. Preserve user data and installed-device state. Native checks must use isolated
    test data unless device validation is explicitly approved.
11. Complete and log each phase before beginning the next. Record explicitly
    when a phase has no findings.
12. Record phase feedback and a candidate remediation TODO for every issue when
    found. Deduplicate and reprioritize those TODOs by root cause in final triage.

## Severity

- **Critical:** likely unrecoverable data loss, broad privacy/security breach,
  or an app-blocking failure affecting most users.
- **High:** realistic data corruption/loss, privacy exposure, broken core flow,
  or persistent background-tracking failure.
- **Medium:** user-visible incorrect behavior, recoverable inconsistency,
  accessibility blocker, or significant reliability/performance risk.
- **Low:** narrow edge-case defect or maintainability issue with demonstrated
  future defect risk.
- **Opportunity:** beneficial cleanup without evidence of current incorrectness.

## Cross-Cutting Lenses

Apply these lenses in every phase.

### Correctness and data integrity

- Can retries, cancellation, process death, or partial failure duplicate, omit,
  or misclassify progress?
- Are persisted rows and in-memory snapshots changed atomically?
- Are numeric, date, timezone, midnight, clock-change, and boundary values safe?
- Do migration and compatibility assumptions still match the shipped schema?
- Which product invariants must always hold, and where are they enforced?

### Failure visibility and recovery

- Does the user learn about actionable failures promptly and accurately?
- Can multiple simultaneous issues coexist without overwriting each other?
- Is every retry idempotent, bounded, and recoverable after restart?
- Does a displayed recovery action actually repair the underlying state?
- Can support diagnose important failures without logging personal or health
  data?

### Lifecycle and concurrency

- Can effects, timers, callbacks, listeners, workers, or promises outlive their
  owners or race with mode changes and app transitions?
- Are re-entrancy guards shared at the correct ownership boundary?
- Can JavaScript, native Android state, SQLite, and Zustand disagree?

### Security and privacy

- Is access least-privilege and scoped to the authenticated owner?
- Can debug and release data or configuration cross boundaries?
- Are logs, errors, exports, and UI surfaces exposing sensitive information?
- Are authorization rules validated against malformed and adversarial writes?

### User experience and accessibility

- Is the visible state truthful during loading, animation, sync, and failure?
- Are controls named, reachable, operable, and stable across text scaling,
  orientation, safe areas, reduced motion, and keyboard changes?
- Can destructive or repeated actions happen accidentally?

### Architecture, ownership, and DRY

- Does each business rule have one authoritative implementation?
- Is repeated code merely similar presentation, or can copies drift in data,
  validation, accessibility, error handling, or side effects?
- Are names aligned with behavior and ownership?
- Is an abstraction reducing real complexity, or only hiding simple code?
- Are there obsolete compatibility paths, unused APIs, unreachable branches,
  duplicated effects, or stale documentation?
- Do module boundaries prevent UI code from owning persistence rules and native
  code from duplicating JavaScript transaction logic?

### Performance and resource use

- Is work proportional to changed data and visible UI?
- Are large arrays, path geometry, selectors, and derived values recomputed on
  hot render paths?
- Are database queries indexed and bounded where growth is unbounded?
- Do background work, timers, listeners, and animations stop when unnecessary?
- Are retention, history, pagination, network, and battery costs bounded?
- Avoid speculative micro-optimization; record only measured costs or clear
  unbounded-growth risks.

### Test quality

- Do tests exercise public behavior and real ownership boundaries rather than
  merely confirming mocks were called?
- Are failure, retry, rollback, cancellation, migration, and concurrency paths
  covered where data integrity depends on them?
- Could a plausible broken implementation still pass the test?
- Are native and configuration assumptions tested at the lowest practical
  boundary?

## Phase 1: Establish Baseline

Record:

- Branch, commit, and working-tree state.
- Full Jest, TypeScript, ESLint, and whitespace results.
- Android unit-test status where applicable.
- Known warnings and whether generated files are incorrectly included.
- Delta from `adversary cleanup 1` so later changes are not confused with review
  findings.
- Any working-tree change after the recorded baseline commit must be identified
  separately and must not silently redefine the review baseline.

## Phase 2: Persistence and Transactional Integrity

Review progress mutations, SQLite transactions, snapshot repair, migrations,
manual entry validation, deletion/edit paths, source values, and hydration.
Stress rollback, duplicate IDs, stale state, interrupted upgrades, and direct
callers that bypass the authoritative mutation path.

## Phase 3: Health, Pedometer, and Source Reconciliation

Review Health Connect/Apple Health ingestion, raw-to-aggregate compatibility,
pedometer watermarking and pruning, dual-source overlap, source switching,
permissions, service-health evaluation, sync issue history, and midnight or
clock-change behavior.

## Phase 4: App Lifecycle, Concurrency, and Native Boundaries

Review bootstrap, foreground/background transitions, shared in-flight work,
WorkManager/Headless JS completion, foreground service ownership, reboot and
process-death recovery, timer/listener cleanup, and JS/native disagreement.

## Phase 5: iOS Readiness and Platform Parity

iOS has not received complete feature implementation or physical-device
validation. Do not classify intentionally absent functionality as a regression
unless existing product documentation claims support.

First record the intended iOS scope as supported, partial, unavailable, or
unknown. Then review implemented iOS code for static correctness, privacy
declarations, HealthKit permissions, lifecycle behavior, native bridge
contracts, build configuration, and compatibility with shared JavaScript logic.

Classify every result as one of:

1. Confirmed defect in implemented behavior.
2. Missing planned functionality.
3. Implemented but requiring simulator or physical-device validation.
4. Intentional platform difference.

Produce a dedicated iOS validation checklist. Do not claim runtime correctness
from mocks, compilation, source inspection, or Android behavior alone.

## Phase 6: Friend Sharing, Firebase, Privacy, and Release Configuration

Review authentication, Firestore rules, collection isolation, publication and
deletion retries, opt-in/out behavior, App Check, build variants, release-only
configuration, privacy disclosures, and quota or enumeration risks.

Also inspect manifests, entitlements, Gradle, CocoaPods, Firebase configuration,
build variants, dependency assumptions, and debug/release isolation.

## Phase 7: UI Workflows, Map Behavior, and Accessibility

Review modal stack transitions, add/edit/delete workflows, sync and issue
recovery UI, map milestone viewport and reveal behavior, orientation and safe
areas, reduced motion, text scaling, focus/accessibility names, and accidental
repeat actions.

## Phase 8: Architecture, DRY, Performance, and Dead Code

Trace repeated business rules and component wiring across subsystems. Look for
ownership drift, misleading names, needless state, stale compatibility code,
unbounded collections or queries, expensive render-time work, and abstractions
that obscure rather than reduce complexity.

DRY findings must answer all three questions:

1. What rule or behavior is duplicated?
2. How can the copies diverge in a user-visible or correctness-relevant way?
3. Where should the single owner live?

## Phase 9: Test Quality and Missing Failure Coverage

Map tests to critical contracts from Phases 2-7. Identify false-confidence
mocks, implementation-detail assertions, missing integration boundaries,
non-determinism, and important native/device checks that cannot be automated.

## Phase 10: Final Triage Report

Report findings first, ordered by severity. Separate:

1. Confirmed defects.
2. Missing high-value tests.
3. Maintainability and performance opportunities.
4. Device/release checks requiring manual validation.

If a phase has no findings, state that explicitly and record residual risk.
Do not begin remediation until findings and candidate TODOs are deduplicated by
root cause and prioritized.

## Review Log

### Phase 0: Tracker created

Created a second-round tracker using the first review, completed TODO items, and
`adversary cleanup 1` as the baseline. Added explicit lenses for disciplined
DRY analysis, ownership, dead code, performance, accessibility, privacy,
release configuration, test quality, and regression/incomplete-fix detection.

### Phase 1: Establish baseline

Baseline: commit `1b441100eb7c707afa5c187304c14e31dcf24b0d` on
`feature/dual-tracking-sources`, one commit ahead of the remote. The working tree
was clean and `git diff --check` passed when the review began.

The delta from `adversary cleanup 1` (`28508b8`) contains only the second-review
tracker and the finalized one-point Map tab edge overlap.

Checks:

- Full Jest: 308 tests passed.
- TypeScript: production and test compiler programs passed.
- ESLint: 0 errors and 1 warning in a generated Android test report.
- Android `testDebugUnitTest`: passed, including isolated Robolectric coverage.
- Gradle reported deprecated features that will be incompatible with Gradle 10;
  the default output did not attribute them to app code or dependencies.

Confirmed product defects: none.

#### Opportunity P1-1: Generated Android reports are included in ESLint

- **Confidence:** Confirmed.
- **Impact:** Generated report code creates irrelevant warnings and can obscure
  actionable lint output; it does not affect runtime behavior.
- **Evidence:** `npm run lint` reports `no-shadow` in
  `android/app/build/reports/tests/testDebugUnitTest/js/report.js`.
- **Candidate TODO:** Exclude Android build-output directories from ESLint, then
  verify source and test files remain covered.
- [x] **Decision (2026-08-25):** Remediated. ESLint now excludes generated
      `android/**/build/**` and `coverage/**` output. `npm run lint` passes with zero
      warnings while maintained source and tests remain in scope.

#### Opportunity P1-2: Gradle 10 deprecation source is unknown

- **Confidence:** Needs validation.
- **Impact:** A future Gradle upgrade may fail if deprecated behavior belongs to
  project build logic. It may instead be dependency-owned and unactionable here.
- **Evidence:** `testDebugUnitTest` succeeds but reports deprecated features
  incompatible with Gradle 10.
- **Candidate TODO:** During the release-configuration phase, run the relevant
  Gradle task with `--warning-mode all`, attribute each warning, and retain only
  project-owned remediation work.
- [x] **Decision (2026-08-25):** Project-owned work remediated. Attribution found
      deprecated Groovy property assignment syntax in `android/app/build.gradle`
      and in installed React Native library build scripts. The app-owned
      assignments now use explicit `=` syntax; `./gradlew testDebugUnitTest
--warning-mode all` passes without an app-owned deprecation. Do not patch
      `node_modules`; track the remaining warnings through dependency upgrades
      before adopting Gradle 10.

Phase feedback: the baseline is reproducible and green. Both app-owned Phase 1
opportunities are resolved. Remaining Gradle 10 warnings are dependency-owned;
device-only behavior and release variants are covered by later phases.

### Phase 2: Persistence and transactional integrity

Reviewed SQLite initialization and migrations, the serialized transactional
entry mutation APIs, snapshot rebuilding, progress-store publication, manual
add/edit/delete workflows, source classification, destructive data actions, and
their nearest tests.

The authoritative entry path is sound: progress writes are serialized, entry
changes and snapshot recomputation share one transaction, Zustand publishes
only committed results, and hydration repairs unversioned or invalid snapshots.
No production caller bypasses this path.

#### Finding P2-1: Interrupted legacy step backfill is not retryable

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** An older installation whose `distance_entries` table lacks
  `steps` can permanently retain zero steps for all existing positive-distance
  rows after a narrowly timed migration failure. Miles remain intact, but
  cumulative and historical step displays become incorrect.
- **Trigger:** `ALTER TABLE distance_entries ADD COLUMN steps ...` succeeds,
  then its following `UPDATE distance_entries SET steps = ...` fails before
  completion. On the next launch, the duplicate-column exception exits the
  shared `try` block, so the backfill is never retried.
- **Evidence:** `src/services/database.ts` places the schema alteration and data
  backfill in one `try`, with duplicate-column handling around both operations.
  SQLite persists the successful alteration independently; initialization does
  not wrap migrations in a transaction.
- **Coverage:** Initialization tests verify fresh-versus-upgraded defaults and
  generic retry after an early failure, but not failure between a successful
  schema alteration and its data backfill.
- **Candidate TODO:** Make the backfill independently idempotent and execute it
  whether the column was added now or already exists. Add an interrupted-
  migration test that retries initialization after failure immediately after
  the alteration.
- [x] **Decision (2026-08-25):** Remediated. Duplicate-column handling now
      covers only the schema alteration, while the idempotent legacy steps
      backfill runs independently on every initialization. A regression test
      interrupts initialization after `ALTER TABLE`, reopens with the column
      already present, and verifies the backfill is retried.

The analogous `progress_snapshot.steps` sequence does not create a permanent
total mismatch by itself because the later `cache_version = 0` migration forces
hydration to rebuild that cache from authoritative entries. The entry-table
backfill remains the root defect.

#### Finding P2-2: Destructive data deletion and bookmark reset are not atomic

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Synced distance can survive or reappear after the user confirms
  Delete Synced Data or Delete All Data. A crash can persist deletion while
  retaining the old sync cursor; an overlapping sync can also commit new rows
  between deletion and bookmark reset.
- **Trigger:** `removeDistanceEntriesBySource` or `resetProgress` commits, then
  the process stops or sync runs before `updateSyncBookmarks` persists
  `syncStartDate = now` and `lastSyncTimestamp = null`.
- **Evidence:** `src/components/Modals/Content/DataContent.tsx` performs progress
  deletion and settings bookmark reset as two awaited database operations with
  no shared transaction or sync exclusion. The actions remain available while
  sync is active.
- **Coverage:** No focused DataContent test covers destructive actions, crash
  boundaries, or overlapping sync. Store transaction tests cover entry/snapshot
  rollback only, not the cross-table workflow.
- **Candidate TODO:** Move each destructive reset into one database-owned
  transaction that deletes the intended entries, recomputes the snapshot, and
  resets bookmarks together. Coordinate it with the sync ownership guard and
  add crash/concurrency tests for both destructive actions.
- [x] **Decision (2026-08-25):** Remediated. Synced-data and all-data deletion
      now use one serialized database transaction that deletes entries, rebuilds
      progress, and resets sync start, health lookback, pedometer/health watermark,
      and reconciliation boundary together. Health, pedometer, and reconciliation
      commits reject cursors at or before the reset boundary, preventing provider
      reads started before deletion from restoring data. Zustand publishes only
      the committed reset result. Tests cover rollback, stale-write rejection,
      caller handling, and post-commit publication.

#### Finding P2-3: Manual write failures are invisible and can lock editing

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** A database failure during manual add, edit, or delete provides no
  user-facing explanation. Add releases its lock but leaks the rejection; edit
  and delete leak the rejection and leave `actionLockRef` set, so the still-open
  editor ignores subsequent save/delete attempts until it is closed and
  reopened.
- **Trigger:** Any durable write rejection, such as a full disk, unavailable
  database handle, or failed snapshot update.
- **Evidence:** `src/components/Modals/Footers/MilesFooter.tsx` has `finally` but
  no `catch`; `src/components/Modals/EditEntryModal.tsx` has neither error
  handling nor `finally` around save/delete. The progress store correctly
  rejects without mutating memory, leaving UI callers responsible for recovery.
- **Coverage:** Store durability tests verify memory remains unchanged after a
  rejection. Footer/editor tests cover input validation and rapid taps but
  never reject the persistence promise.
- **Candidate TODO:** Define one user-facing manual-write failure contract,
  release locks in `finally`, retain the user's input/editor state, and provide
  a retryable error. Add rejection tests for add, edit, and delete.
- [x] **Decision (2026-08-25):** Remediated. Add, edit, and delete now show a
      contextual persistence error in the existing live validation region, retain
      input/editor state, and release action locks in `finally`. Focused tests
      verify each failed action can be retried successfully.

#### Phase 2 rejected candidates

- Separate SQLite commit followed by Zustand `setState` in pedometer, health,
  and reconciliation paths is not an interleaving race: `setState` is
  synchronous and no JavaScript callback can run between adjacent statements.
  Process death rehydrates the committed cursor and entries from SQLite.
- `manual_${Date.now()}` is not currently a rapid-double-tap collision within
  the mounted footer because its lock is acquired before timestamp generation
  and held until the durable write settles. The ID scheme can be reconsidered
  as an architecture opportunity, but the proposed two-taps-in-one-millisecond
  data-loss scenario is not reachable through this UI.
- Closing the editor during an in-flight save does not cancel the store write;
  the durable operation continues. Its unreported rejection is already covered
  by P2-3 rather than recorded as a separate root cause.

Phase feedback: all three Medium findings are resolved. Snapshot/cache
integrity, transaction rollback, save-ID scoping, legacy source acceptance, and
direct entry mutation ownership showed no additional defect. The affected
database, reset, store, pedometer, reconciliation, and manual-entry suites pass
61 tests; the full Jest suite passes 317 tests.

### Phase 3: Health, pedometer, and source reconciliation

Reviewed foreground and background pedometer commits, WorkManager task
hydration, raw-sample reads and pruning, mode switching, commit-health
evaluation, Health Connect/Apple Health chunking, Android raw-to-aggregate
cutover, lookback alignment, dual-source reconciliation, permission fallback,
and their nearest tests. Sixty-nine focused tests passed.

#### Finding P3-1: A backward wall-clock change can permanently lose steps

- **Severity:** High.
- **Confidence:** Confirmed.
- **Impact:** Pedometer-backed progress silently stops until wall time catches
  up to the persisted future watermark. Steps recorded during the repeated time
  interval are then excluded from all later windows and never materialized into
  journey progress.
- **Trigger:** A commit records watermark `T`, then the device clock moves
  backward before `T`. This includes correcting an accidentally future-set
  clock or a manual/time-service adjustment larger than normal clock drift.
- **Evidence:** Every commit caller treats `now <= watermark` as a no-op.
  `evaluatePedometerCommitHealth` explicitly classifies a future watermark as
  healthy, so no recovery is attempted or shown. Native `step_samples` use
  `System.currentTimeMillis()`, and `readStepsBetween` selects samples by those
  wall-clock timestamps. Once time passes `T` again, `T` becomes the query
  anchor, excluding steps whose corrected timestamps fell before `T`.
  `useLivePedometerDelta` also queries the inverted range and suppresses errors.
- **Coverage:** A health-evaluation test asserts that a watermark ahead of the
  clock is `ok`; no test verifies commit or live-delta recovery and step
  preservation across clock rollback.
- **Candidate TODO:** Define a clock-discontinuity policy shared by commit,
  health evaluation, and live display. Detect future watermarks before pruning
  or committing, preserve/count the native cumulative delta safely, establish a
  new monotonic boundary, and surface uncertainty if exact recovery is
  impossible. Add native and JS tests for forward-then-backward and direct
  backward changes.
- [x] **Decision (2026-08-25):** Remediated. Native samples now persist elapsed
      realtime, use Android's boot counter for reboot identity, throttle on the
      monotonic clock, and expose an insertion-ordered sample cursor. The JS
      database commits that cursor atomically with distance progress using
      compare-and-swap semantics, while wall time remains entry/day metadata.
      Foreground, WorkManager, and live-delta paths route future wall
      watermarks through cursor recovery. Schema upgrades retain version-1
      samples and bootstrap their last committed wall-time anchor before
      replaying newer insertion-ordered samples. Native rollback/reboot tests,
      JS migration/rollback tests, full Jest, TypeScript, ESLint, and focused
      Android unit tests pass.

#### Finding P3-2: Pedometer commits lack a global single-flight owner

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Overlapping commit triggers can regress the durable watermark and
  replace a longer `pedo_<from>` row with a shorter one. Progress is understated
  until another commit recovers the tail; overlap with a mode transition can
  also publish an old-source cursor after the new mode boundary and make
  milestone behavior inconsistent.
- **Trigger:** WorkManager, a mode-switch/stop flush, or another direct caller
  overlaps the hook's live/AppState commit. Both read the same watermark before
  either durable write completes, then commit different end times out of order.
- **Evidence:** `useSyncInterval` has a hook-local `inFlightRef`, but
  `pedometerBackgroundTask`, `trackingModeService`, and
  `SyncContentAndroid` call `commitPedometerRange` directly. The database write
  queue serializes writes but does not compare cursor freshness. Entry IDs use
  only `segment.fromMs`, and `INSERT OR REPLACE` plus an unconditional cursor
  update allows the later-finishing shorter window to replace the longer one
  and move the cursor backward.
- **Coverage:** Commit tests verify stable IDs, rollback, and repeated identical
  windows, but no test runs different overlapping windows concurrently or
  completes them out of order.
- **Candidate TODO:** Put single-flight ownership or monotonic compare-and-commit
  inside the shared pedometer commit/database boundary, not individual callers.
  Ensure stale windows cannot replace newer rows or regress cursors. Add
  controlled out-of-order tests spanning live, Worker, and mode-switch callers.
- [x] **Decision (2026-08-27):** Remediated. `commitPedometerRange` now owns a
      failure-resilient process-wide queue shared by live, AppState,
      WorkManager, mode-switch, and Sync-Now callers. Each queued request
      re-reads the committed watermark before native I/O: fully stale ranges
      become no-ops and longer flushes rebase to the uncommitted tail. The
      database cursor compare-and-swap remains a second defense against resets
      and state changes outside the queue. A deferred-read regression test
      verifies that overlapping reads are serialized, a shorter request cannot
      regress state, and a transition flush resumes at the latest watermark.

#### Opportunity P3-3: Timed-out health reads continue behind retries

- **Confidence:** Confirmed.
- **Impact:** A timeout rejects only the JavaScript wrapper. The original native
  provider read keeps running while the retry starts another read, increasing
  provider work and battery use during a stall. Reads have no persistence side
  effect, so no data-integrity defect was demonstrated.
- **Evidence:** `withTimeout` races a timer against the promise but has no
  cancellation mechanism; the retry loop immediately calls the provider again.
- **Coverage:** No test exercises timeout, late resolution, and retry overlap.
- **Candidate TODO:** During performance/test-quality triage, determine whether
  the native adapters can support cancellation or whether retries should wait
  for provider settlement. Add a fake-timer test proving late first-read results
  cannot alter sync state.
- [x] **Decision (2026-08-27):** Remediated. The installed and current upstream
      APIs for `react-native-health-connect` and `react-native-health` expose no
      cancellation signal or native query handle. Health chunk reads therefore
      retain one delayed retry only for settled transient failures; a timeout
      now fails immediately instead of starting a second read while the first
      may still be running. Permission and overall-stall failures retain their
      existing escalation paths. Fake-timer coverage verifies that a timed-out
      read is invoked once and its late result cannot reach progress handling,
      while a settled transient failure still retries once.

#### Phase 3 rejected candidates

- Health lookback alignment does not move before its floor: the return value is
  clamped with `Math.max(lookbackStartTimestamp, aligned)` and focused tests
  cover the boundary.
- Local calendar-day reconciliation is DST-aware by construction;
  `setDate(+1)` intentionally permits 23- and 25-hour local days. Replacing it
  with fixed UTC 24-hour windows would break the product's local-day model.
- Mount and foreground sync requests do not both mutate status: the second call
  returns at the in-flight guard before status publication.
- WorkManager uses the current `CoroutineWorker`/`ReactHost` implementation, not
  the deleted Headless JS service cited by an exploratory report. It retries
  native startup and timeout failures, and release minification is currently
  disabled.
- The background task hydrates settings and progress from SQLite before reading
  its watermark; it does not default an existing installation to `now`.
- A permission failure during dual reconciliation intentionally falls back to
  pedometer mode and persists the source change. Existing reconciliation tests
  prove the cursor does not advance on provider failure.

#### Phase 3 missing high-value coverage

- Controlled overlapping/out-of-order pedometer commits across independent
  triggers.
- Wall-clock rollback across JS watermarking and native sample timestamps.
- Health-provider timeout, late resolution, and retry behavior.
- Runtime integration of the Android raw-to-aggregate cutover remains more
  weakly covered than its pure transition helpers, although the prior review's
  transaction/cutover tests cover persistence and rollback contracts.

Phase feedback: one confirmed High finding, one confirmed Medium finding, and
one bounded performance opportunity. Health chunk coverage, ID stability,
cutover persistence, reconciliation idempotency, permission fallback, pruning
anchors, and normal source switching showed no additional verified defect.
Phase 4 has not started.

### Phase 4: App lifecycle, concurrency, and native boundaries

Reviewed bootstrap and retry sequencing, initialization gates, foreground
listeners, Splash ownership, WorkManager/Headless JS completion, Worker timeout
and cancellation cleanup, foreground-service startup and restart behavior,
reboot recovery, native service-health reporting, and release minification.
Focused App tests and Android pedometer unit tests passed.

Bootstrap ordering now distinguishes critical hydration from recoverable
service setup. Health and friend sync remain gated while the initialization
phase is `loading`, and readiness is published only after database, settings,
and progress hydration succeed. App Check, development mock setup, and
tracking-mode reconciliation log isolated failures and continue; known
actionable tracking failures are persisted by the reconciliation service for
the Welcome screen's sync banner. Database initialization clears a failed
cached promise and closes a partial handle, while settings and progress
hydration can be repeated on retry.

#### Finding P4-1: Headless task failures are reported as successful work

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** A transient database, hydration, native bridge, or pedometer
  commit failure during a background sweep suppresses WorkManager's retry
  policy. The watermark is preserved, so this does not directly lose data, but
  progress remains stale until the next periodic run, which may be hours later
  or further delayed by the OS.
- **Trigger:** Any exception inside `pedometerBackgroundTask`, including a
  rejected `commitPedometerRange` call, after the Worker successfully starts
  the Headless JS task.
- **Evidence:** `src/services/pedometerBackgroundTask.ts` catches both commit
  and outer task failures and resolves normally. The native
  `PedometerBackgroundWorker` can return `Result.retry()` only when task
  startup throws or its 60-second timeout expires; normal Headless completion
  always returns `Result.success()` and carries no JS success/failure result.
- **Coverage:** Commit tests cover rejection and watermark preservation, but no
  test covers the Headless task-to-Worker completion contract. Current Android
  tests do not execute a JS task that rejects.
- **Candidate TODO:** Let retryable background-task failures reject across the
  Headless boundary so the Worker returns `Result.retry()`, while retaining
  intentional no-work exits as success. Add JS task tests for fatal, commit,
  and no-work outcomes plus an Android boundary test proving rejection maps to
  retry.

This is distinct from P3-2: global commit ownership prevents concurrent cursor
regression, while this finding ensures a failed Worker-owned attempt is
rescheduled promptly.

- [x] **Decision (2026-08-27):** Remediated. Each Worker run now registers a
      unique request ID before starting Headless JS and passes it in the task
      data. The JavaScript task reports success for normal and intentional
      no-work completion, or retry for database, hydration, bridge, and commit
      failures. The Worker requires both normal Headless completion and the
      matching report, maps a reported failure to `Result.retry()`, and removes
      the pending result on success, failure, timeout, or cancellation. Missing
      and late reports retain the existing conservative timeout/retry behavior;
      duplicate reports cannot overwrite the first outcome. JavaScript tests
      cover no-work, commit-failure, fatal-hydration, and native-bridge-failure
      outcomes, while a focused Android test covers result delivery and
      WorkManager retry mapping.

#### Finding P4-2: A stale Splash fade can hide a restarted bootstrap

- **Severity:** Low.
- **Confidence:** Confirmed.
- **Impact:** A retry started while the Splash is fading can briefly expose the
  map and stores before bootstrap completes. The overlay is pointer-transparent,
  so the partially hydrated interface can also receive input.
- **Trigger:** Bootstrap enters `error` and a retry is activated during the
  Splash's 600-millisecond delayed fade. The `loading` effect restores opacity
  and visibility but does not stop the old animation; its completion callback
  later calls `setVisible(false)`.
- **Evidence:** `SplashOverlay` in `App.tsx` starts `Animated.timing(...).start`
  without retaining or stopping the animation on effect cleanup or when
  `loading` becomes true. The loading branch cannot invalidate the previous
  completion callback.
- **Coverage:** The Splash test covers only the delayed spinner. It does not
  toggle `loading` from false back to true before fade completion or assert
  cleanup on unmount.
- **Candidate TODO:** Own and stop the active fade during effect cleanup and
  guard completion against stale loading state. Add a fake-timer transition
  test for `false -> true` during both the delay and active fade.
- [x] **Decision (2026-08-27):** Remediated. `SplashOverlay` now consumes the
      explicit bootstrap status, remains opaque and input-blocking while
      loading, fades only after `ready`, and yields immediately to the blocking
      recovery screen on `error`. It owns and stops its active animation, and
      only a successfully finished current fade may hide the overlay. Welcome
      mounts only after critical hydration reaches `ready`; its in-memory
      default still shows it once per cold JavaScript launch without reopening
      it on foreground resume. Fake-timer tests cover delayed spinner display,
      ready-only removal, and restarting loading during an active fade. A
      separate regression test proves recoverable bootstrap failures do not
      reject initialization. Focused Jest, TypeScript, ESLint, Prettier, and
      editor diagnostics pass.

#### Phase 4 rejected candidates

- Sync does not start against default stores during bootstrap. Both sync hooks
  check initialization readiness, and readiness is published only after all
  hydration and tracking reconciliation complete.
- Bootstrap retry is not permanently poisoned by a rejected database promise;
  `database.init()` clears it in `finally`, closes partial initialization, and
  has focused retry coverage. Store loaders replace their hydrated fields and
  are safe to repeat.
- The Worker's timeout and cancellation paths remove ReactHost and task
  listeners and finish a running task on the UI thread. No listener leak was
  demonstrated.
- The current Worker starts `HeadlessJsTaskContext` directly and does not
  require the deleted Headless JS service to be registered in the manifest.
- `StepCounterService.isRunning` becomes true only after foreground promotion
  and sensor listener registration. Permission, sensor, and foreground
  promotion rejection paths stop without claiming healthy service state.
- Notification denial alone is not evidence that Android foreground promotion
  throws; the activity-recognition permission required by the `health` service
  type is checked before startup and again inside the service.
- WorkManager persists unique periodic work across process death and reboot.
  Re-enqueueing it after `startForegroundService` in `BootReceiver` is
  redundant recovery, so a service-start exception skipping that enqueue does
  not establish an unscheduled-worker defect.
- Release minification is disabled, so proposed ProGuard removal of Worker or
  React Native classes is not a current runtime path.
- Foreground reconciliation can overlap a commit trigger, but the resulting
  cursor risk is already owned by P3-2 rather than a separate lifecycle root
  cause.

#### Phase 4 missing high-value coverage

- A device/instrumentation test that executes the bundled Headless JavaScript
  task through a real ReactHost and observes the resulting WorkManager state.
  Unit tests cover the JavaScript classification and native result mapping on
  either side of that runtime boundary.
- End-to-end service startup acknowledgment remains device-only: the bridge
  confirms dispatch, while actual foreground promotion occurs asynchronously.
  Static inspection found recovery on the next foreground reconciliation but
  cannot prove OEM behavior.

Phase feedback: the confirmed Medium and Low findings are remediated. Bootstrap
gates, retryable database initialization, AppState cleanup, Worker cancellation
cleanup, service-health ordering, and reboot/process-death ownership showed no
additional verified defect. Phase 4 is complete. Phase 5 has not started.

### Phase 5: iOS readiness and platform parity

Reviewed the stated iOS product scope, Apple Health service and UI, shared sync
branches, HealthKit permissions and entitlement, Background Refresh bridge,
AppDelegate, Pod integration, deployment targets, privacy manifest, Firebase
configuration selection, and nearest tests. Twenty-eight focused JavaScript
tests passed, and `plutil` validated the app plist, privacy manifest, and
entitlements.

#### Intended iOS scope

- **Supported:** Manual journey entry and single-source Apple Health reads for
  walking/running distance and steps, foreground two-minute Live sync, explicit
  Sync now, catch-up on app resume, persisted progress, friend sharing, and the
  shared Map/UI experience. The README says iOS is compatible but has no
  distributed download.
- **Partial:** Native configuration and simulator-static behavior exist, but no
  iOS production artifact or physical-device release baseline has been
  established. HealthKit prompts and reads, App Attest, release Firebase,
  background/foreground transitions, and modal/device layout remain validation
  gates.
- **Unavailable:** Pedometer and dual-source modes are intentionally Android
  only. The iOS service stub reports unsupported, the iOS Sync UI omits those
  choices, and the release checklist identifies the difference.
- **Unknown:** No true background Apple Health execution is implemented or
  claimed by the main Live sync UI. The app has no HealthKit observer delivery,
  background-fetch task, `BGTaskScheduler` registration, or
  `UIBackgroundModes` declaration.

#### Finding P5-1: iOS reports a background capability it does not implement

- **Classification:** Confirmed defect in implemented behavior.
- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** iOS users with Background App Refresh disabled receive a durable
  tracking issue saying that turning it on will restore background updates.
  That action cannot change the app's sync behavior because no background
  execution path is registered. The warning is also created when Live sync is
  disabled, so users who selected explicit/manual sync can be told to repair a
  capability they did not enable.
- **Trigger:** Apple Health sync is connected and
  `UIApplication.backgroundRefreshStatus` is `denied` or `restricted`; the hook
  checks only `syncEnabled`, not `liveSyncEnabled` or an implemented background
  task.
- **Evidence:** `src/hooks/useSyncInterval.ts` adds `backgroundDisabled` on
  mount and foreground resume whenever health sync is enabled.
  `src/components/SyncErrorBanner.tsx` says new activity will sync only when the
  app opens and directs the user to turn on Background App Refresh "to fix
  this." The iOS target contains only a status-reading bridge; searches across
  iOS and shared code find no background fetch, HealthKit observer,
  `BGTaskScheduler`, background delivery, or `UIBackgroundModes`. Implemented
  Live sync is a foreground JavaScript interval plus resume catch-up.
- **Coverage:** Banner tests verify the misleading copy renders. No hook test
  covers status detection, Live-sync-off behavior, issue resolution, or a real
  background execution contract.
- **Candidate TODO:** Remove the Background App Refresh issue and native bridge
  while sync remains foreground-only. If true background Apple Health delivery
  is later implemented, restore capability detection only for that feature,
  gate it on the user's setting, and add native lifecycle tests proving the
  advertised recovery action changes behavior.
- [x] **Decision (2026-08-27):** Remediated. The app no longer creates or
      persists a `backgroundDisabled` sync issue, advertises Background App
      Refresh as a recovery action, or exposes the unsupported condition in
      developer controls. The unused JavaScript status service, Swift/Objective-C
      bridge, bridging header, and Xcode source references were removed. The
      existing foreground interval and resume catch-up behavior are unchanged.
      Focused sync-banner and issue-durability tests pass, and the edited Xcode
      project validates with `plutil`.

#### Finding P5-2: The documented Debug iOS configuration cannot build

- **Classification:** Confirmed defect in implemented behavior.
- **Severity:** Medium.
- **Confidence:** Confirmed by build.
- **Impact:** A contributor following the README cannot build or launch the iOS
  app from the repository, including on the simulator. This blocks static and
  runtime validation of Apple Health-adjacent shared behavior and all ordinary
  iOS development until an undocumented Debug Firebase app configuration is
  supplied.
- **Trigger:** Build the `MiddleEarthChallenge` scheme with the Debug
  configuration, including `npm run ios` or an unsigned generic-simulator
  build.
- **Evidence:** `ios/Firebase/README.md` says Debug builds are intentionally
  unconfigured and lists only the Release plist. The repository contains only
  `ios/Firebase/Release`, but the Xcode copy phase unconditionally requires
  `Firebase/${FIREBASE_CONFIGURATION}/GoogleService-Info.plist` and exits with
  an error when absent. `AppDelegate.swift` also calls
  `FirebaseApp.configure()` unconditionally. The unsigned Debug simulator build
  failed at that phase with `Missing Firebase configuration: .../Firebase/Debug/GoogleService-Info.plist`.
- **Coverage:** There is no configuration test or CI build proving the
  documented Debug variant is buildable without a Firebase client. JavaScript
  mocks cannot exercise this Xcode phase or native startup.
- **Candidate TODO:** Choose and enforce one Debug contract. Either register and
  provide the `com.middleearthchallenge.debug` Firebase configuration through a
  documented secure setup, or make the copy phase and AppDelegate tolerate an
  intentionally unconfigured Debug build while disabling Firebase-dependent
  features explicitly. Add an unsigned simulator build to CI and keep Release
  strict about its production plist.
- [x] **Decision (2026-08-27):** Remediated. Debug builds now skip Firebase
      configuration when `Firebase/Debug/GoogleService-Info.plist` is absent;
      the copy phase removes any stale destination plist and AppDelegate starts
      React Native without configuring a default Firebase app. The Firebase
      README documents that Firebase-dependent sharing, authentication,
      Firestore, and App Check features are unavailable in that state and how
      to enable them with a registered Debug client. Non-Debug builds still
      fail the copy phase when their required plist is missing, and AppDelegate
      also treats a missing bundled plist as fatal outside Debug. The same
      unsigned generic-simulator Debug build that previously failed now
      completes successfully.

#### Missing planned functionality

- iOS pedometer and dual-source parity remain explicitly deferred. This is not
  a regression in the current iOS Health App product surface. Before adding it,
  define Core Motion retention/backfill, authorization, background execution,
  and source-reconciliation behavior rather than reusing Android service
  assumptions.

#### Phase 5 rejected candidates

- The Background Refresh status effect does guard its awaited result with a
  `cancelled` check before reading or mutating the progress store; the claimed
  post-unmount issue mutation is not reachable through that path.
- Replacing the module-level active sync callback does not lose a manual sync
  request. Registration follows the current `performSync`, and cleanup clears
  it only when the stored callback still matches that effect instance.
- HealthKit read authorization cannot be queried reliably by design. The app
  requests only read access, propagates callback read failures through its sync
  error path, and does not require `NSHealthUpdateUsageDescription`.
- The HealthKit entitlement is attached to Debug and Release, the read-purpose
  string names distance use, `react-native-health` is installed through CocoaPods,
  the Swift bridge is included in target sources, and the privacy manifest is
  bundled. No static capability-wiring defect was found.
- iOS pedometer absence is documented and hidden by the platform-specific Sync
  UI. It is planned functionality, not a broken current flow.
- Health data used only on-device does not require a collected-data entry in
  the app privacy manifest. Friend-sharing privacy and release declarations are
  reviewed in Phase 6.

#### iOS validation checklist

- [x] Parse Info.plist, PrivacyInfo.xcprivacy, and entitlements with `plutil`.
- [x] Verify HealthKit entitlement and read-purpose description in source.
- [x] Verify Apple Health selects the stronger distance/step signal and rejects
      either provider read failure in focused tests.
- [x] Run an unsigned Debug simulator build without a Debug Firebase plist;
      dependency and app-target compilation complete successfully.
- [ ] On a physical iPhone, grant and deny Steps/Distance independently and
      verify prompt, error, retry, and Settings recovery behavior.
- [ ] Backfill at least one year of HealthKit data, including manually added and
      overlapping device samples, and verify totals and practical query time.
- [ ] Exercise active, inactive, background, force-quit, relaunch, timezone,
      DST, and clock-change transitions without duplicate or missing entries.
- [ ] Validate the Release Firebase plist and App Attest provider on physical
      hardware before enabling an iOS release.
- [ ] Verify modal safe areas, keyboard behavior, rotation, Dynamic Type,
      reduced motion, and VoiceOver on a notched iPhone and iPad if supported.
- [ ] Produce and inspect a signed Release archive, privacy report, exported
      entitlements, and App Store validation output.

Phase feedback: both confirmed Medium defects are remediated. One feature area
remains explicitly deferred, and substantial physical-device/release validation
remains. Static Apple Health reads, permissions, source IDs, platform dispatch,
native bridge linkage, plist syntax, and capability declarations showed no
additional verified defect. Phase 5 is complete. Phase 6 has not started.

### Phase 6: Friend sharing, Firebase, privacy, and release configuration

Reviewed anonymous authentication, participant reads/writes, provisioning and
deletion retries, Firestore Rules, App Check initialization and rollout state,
global-community visibility, query bounds, malformed documents, cloud data
inventory, platform privacy configuration, debug/release isolation, and nearest
tests. Forty-four focused sharing and App Check tests passed.

The implemented product uses one implicit global community, not invite-only
friend groups. Any authenticated installation may read opted-in participants;
owner-only Rules protect writes and deletion. That audience is an explicit
product decision documented in `docs/shared-progress.md`, so global reads are
not reopened as a defect in this review.

#### Finding P6-1: Cold-start sharing fetch does not wait for Auth hydration

- **Severity:** Low.
- **Confidence:** Confirmed.
- **Impact:** An opted-in user can see a false Friend Progress load failure on
  cold launch even though their persisted anonymous session is valid. Cached
  markers may remain stale, and recovery waits for the next eligible sync or
  foreground transition.
- **Trigger:** Local settings finish loading and start Friend Progress sync
  before Firebase Auth has restored `currentUser`.
- **Evidence:** `enableFriendProgress` and `deleteFriendProgress` explicitly
  await `authStateReady()`, but `fetchFriendProgressPage` calls
  `getExistingUserId()` synchronously. App bootstrap gates on local database
  hydration, not Firebase Auth hydration. The first enabled sync publishes only
  when miles changed and then fetches, so an unchanged profile can reach the
  unguarded fetch immediately.
- **Coverage:** Service tests cover Auth hydration before enable and delete but
  configure an already-present user for fetch. No test holds Auth restoration
  pending while an automatic fetch begins.
- **Candidate TODO:** Make every operation that requires an existing anonymous
  identity await the same Auth-ready boundary before reading `currentUser`.
  Add a cold-start test where local sharing is enabled, Auth restores after the
  sync begins, and fetch succeeds without a transient error.
- [x] **Decision (2026-08-28):** Remediated. The shared existing-user lookup now
      awaits `authStateReady()` before reading `currentUser`, so participant
      fetches, distance publication, and profile updates cannot mistake an
      unrestored session for a signed-out user. Deletion retains its separate
      no-session-is-complete behavior. A delayed-restoration regression test
      verifies that participant fetching does not reach Firestore before Auth
      is ready and then uses the restored user ID.

#### Finding P6-2: iOS cloud-sharing collection categories are undeclared

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** A future iOS privacy report would omit the Name, User ID, and
  Fitness categories collected by opted-in sharing. Aggregate journey distance
  may be derived from HealthKit fitness data, so sending it off-device is
  collection even though raw HealthKit rows remain local.
- **Trigger:** Enable Friend Progress, which continuously publishes and retains
  the participant document in Firestore until opt-out deletion succeeds.
- **Evidence:** Firestore documents are keyed by stable anonymous Firebase UID
  and contain `displayName`, `affinity`, `distanceMiles`, and `updatedAt`.
  `FriendProgressContent` tells users that their Hobbit name, color, and total
  distance are stored and shared with other participants, and separately
  explains deletion. That is sufficient plain-language consent copy: the
  assigned identifier and server timestamp are implementation details rather
  than useful user-facing disclosures. However,
  `ios/MiddleEarthChallenge/PrivacyInfo.xcprivacy` declares an empty
  `NSPrivacyCollectedDataTypes` array. Apple specifically defines Name, User ID,
  and Fitness categories for formal privacy declarations.
- **Coverage:** UI tests exercise repeat taps and retry only. No test asserts
  the opt-in data inventory, and no release check compares the privacy manifest
  or store disclosures with the Firestore schema.
- **Candidate TODO:** Declare Name, User ID, and Fitness as linked, non-tracking
  data used for app functionality in the iOS privacy manifest. If the app is
  ever submitted to the App Store, mirror those categories in App Store
  Connect.
- [x] **Decision (2026-08-28):** Remediated. The existing in-app disclosure is
      retained because it already names the meaningful shared data, participant
      audience, purpose, and deletion controls without exposing internal terms.
      The iOS privacy manifest now formally declares Name, User ID, and Fitness
      as linked, non-tracking data used only for app functionality. The server
      publication timestamp requires no separate category. No App Store Connect
      declaration is currently needed because an App Store release is not
      planned.

#### Finding P6-3: Rules allow participant names the client rejects

- **Severity:** Low.
- **Confidence:** Confirmed.
- **Impact:** A modified authenticated client can create a whitespace-only
  participant that consumes storage and query reads but is silently skipped by
  every normal client. Repeated malformed rows can reduce useful results in the
  bounded first page and amplify quota use.
- **Trigger:** The document owner writes a non-empty string containing only
  whitespace as `displayName` through a custom or modified client.
- **Evidence:** Firestore Rules require only `displayName.size() > 0` and a
  maximum of 60. The production parser rejects
  `displayName.trim().length === 0`, proving the server and reader contracts
  differ. Pagination advances by
  documents read, while the current map fetches only the first 50-document
  page.
- **Coverage:** The parser test rejects blank names, but no Rules emulator test
  attempts the same write. The only Rules-related test parses the `hasOnly`
  field list as text.
- **Candidate TODO:** Make Rules enforce the same canonical display-name
  contract as the client, or use a server-written normalized field that Rules
  can validate. Add emulator tests for whitespace names, field allowlists,
  owner-only writes/deletes, affinities, numeric boundaries, timestamps, and
  production/debug collection isolation.
- [x] **Decision (2026-08-28):** Remediated. `validParticipant` now requires
      `displayName.trim().size() > 0`, matching the production parser and write
      normalization while retaining the 60-character raw-value cap. The
      cross-layer Rules parity suite asserts the canonical nonblank check in
      addition to field and affinity parity. The focused suite passes. A real
      Rules emulator load remains blocked because the installed Firebase Tools
      requires Java 21 and the available runtime is Java 17.

#### Release-state validation P6-4: App Check enforcement evidence conflicts

- **Confidence:** Confirmed and remediated.
- **Impact:** If Firestore enforcement is off, public Firebase configuration
  plus anonymous Auth permits scripts without valid app attestation to read the
  global participant collection and create owner documents, increasing privacy
  and quota-abuse risk. If enforcement is on, this is documentation drift rather
  than a runtime defect.
- **Evidence:** The first review records Cloud Firestore enforcement as enabled
  and physically verified for release and Debug Android builds.
  `docs/app-check-rollout.md` instead says the App Check API and Firestore
  enforcement remain pending. Enforcement is a Firebase Console setting and is
  not represented by Security Rules or repository configuration.
- **Candidate TODO:** Verify current Cloud Firestore enforcement and App Check
  API state in the production project, capture dated evidence, run one
  enable/fetch/delete cycle from attested Release and registered Debug builds,
  and reconcile both documents. Treat enforcement as a release gate while the
  participant collection is globally readable.
- [x] **Decision (2026-08-28):** Remediated. An authenticated production App
      Check Admin API read returned `ENFORCED` for
      `projects/648232041356/services/firestore.googleapis.com`, with
      `updateTime` `2026-08-20T01:39:25.168767Z`; the successful API response
      also confirms that `firebaseappcheck.googleapis.com` is enabled. The
      first review already records successful post-enforcement Firestore server
      round trips from attested Release and registered Debug Android builds,
      plus a Release enable/stop sharing cycle. The stale rollout checklist now
      matches that evidence. No production setting was changed during this
      verification.

#### Phase 6 rejected candidates

- Firestore Security Rules do not expose a `request.appCheck` field; App Check
  enforcement belongs to the Firebase service setting. Adding the exploratory
  report's proposed Rules expression would not be a valid remediation.
- Global authenticated participant reads are the accepted single-community
  model. Invite-only groups remain deferred design notes, not implemented
  authorization that has regressed.
- Reads are bounded to 50 documents with stable document-ID pagination. The
  current store requests only the first page, so no unbounded client read loop
  was found.
- Opt-out persists deletion intent before cloud work, flushes the queued delete
  before signing out, retains the only deleting identity after failure, and
  retries on launch. Delete All also preserves pending cloud cleanup when local
  deletion continues.
- Debug and Release Android applications have distinct bundle IDs, Firebase
  clients, App Check providers, and Firestore collections. The absent iOS Debug
  Firebase client is already P5-2, not a new isolation finding.
- Release signing passwords remain the explicitly accepted first-review Low
  risk: the private keystore is ignored and no changed exposure was found.
- Logging a malformed participant document ID is avoidable diagnostics data,
  but no health record, journey entry, display name, or distance is logged; no
  separate privacy breach was demonstrated.

#### Phase 6 missing high-value coverage

- Firestore Rules emulator tests for authorization, schema, numeric/name
  boundaries, server timestamps, and collection isolation. A local syntax load
  attempt was blocked because installed Firebase Tools requires Java 21 while
  the available runtime is Java 17.
- If the app is distributed through a store, release checks tying the formal
  manifest categories to App Store privacy labels or Android Data Safety.
- Attested physical-device enable, fetch, update, opt-out, offline deletion, and
  post-enforcement rejection from an unattested client.

Phase feedback: all confirmed findings and production-state validations are
remediated. Rules ownership, durable
provisioning/deletion, single-flight sync, bounded reads, malformed-document
containment, and Android variant isolation showed no additional verified
defect.

### Phase 7: UI workflows, map behavior, and accessibility

Reviewed shared and edit modals, manual add/edit/delete controls, settings and
sync recovery surfaces, map gestures and point layers, milestone positioning,
route reveal lifecycle, animation ownership, orientation remounting, safe-area
and keyboard handling, and nearest UI tests. Production code remained
read-only.

The revised map behavior remains internally consistent: one path-reveal
algorithm starts outside the visible edge, continues from Rivendell through
Mordor, and replays only after the Welcome modal closes. Gesture clamping and
recenter behavior share the same orientation-aware bounds. No regression in
those recently changed contracts was found by source inspection and existing
tests.

#### Finding P7-1: Continuous status motion ignores Reduce Motion

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Users who enable the platform Reduce Motion setting still receive
  indefinite rotation, pulsing, and shimmer effects during sync and status
  states. These animations can remain active for the duration of a slow or
  stalled operation and may cause vestibular discomfort.
- **Trigger:** Enable Reduce Motion, then start sync or display an in-progress
  status. The map pulse/shimmer, shared modal spinner, welcome sync indicator,
  and in-progress status badge continue looping.
- **Evidence:** `SyncSpinner` and `SyncIndicator` use unbounded Reanimated
  `withRepeat` rotations; `MapScreen` starts unbounded pulse and shimmer loops;
  `StatusBadge` starts an unbounded core `Animated.loop`. None reads or
  subscribes to the Reduce Motion setting. `CelebrationBorder` demonstrates the
  existing correct local pattern with `AccessibilityInfo` and a
  `reduceMotionChanged` subscription.
- **Coverage:** Celebration suppression has focused tests, but the spinner,
  indicator, map sync effects, and status badge have no Reduce Motion tests.
- **Candidate TODO:** Establish one shared reactive Reduce Motion owner and
  stop or replace all indefinite decorative loops with static status cues when
  enabled. Apply the same policy to long route/progress transitions, then add
  setting-at-mount and setting-changed tests for both Reanimated and core
  Animated consumers.
- [x] **Decision (2026-08-28):** Remediated. The shared `useReduceMotion` hook
      owns the platform query and runtime subscription with a motion-safe
      initial state. `SyncSpinner`, `SyncIndicator`, `StatusBadge`, map pulse
      and shimmer, and `CelebrationBorder` cancel and reset indefinite loops
      when Reduce Motion is enabled while retaining static status cues. Startup
      path reveal and distance-scaled progress transitions now jump to their
      completed values under the same policy. Focused tests cover enabled-at-
      mount and runtime changes across Reanimated and core Animated consumers,
      plus immediate path/progress completion. TypeScript, ESLint, formatting,
      and all 337 Jest tests pass.

#### Finding P7-2: Checkpoint and trivia map controls are unnamed graphics

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Screen-reader users cannot identify or meaningfully activate
  trivia points or checkpoint circles. Checkpoints become especially
  inaccessible when visible labels are disabled; trivia points never have a
  text child.
- **Trigger:** Navigate the map with VoiceOver or TalkBack and focus a point
  circle, including any trivia point or a checkpoint while Labels is off.
- **Evidence:** `Point` renders each interactive circle as a
  `TouchableOpacity` containing only animated graphic views, without an
  accessibility role, label, state, or hint. `PositionedPoint` has the item
  name and type but forwards only the visual `name`; the separate checkpoint
  label button is conditionally hidden and trivia has no label button.
  `FriendProgressMarkerLayer` provides a nearby correct map-control pattern
  with a button role, descriptive label, and expanded state.
- **Coverage:** No component test renders map points or asserts their accessible
  names, roles, locked/unlocked state, or activation behavior.
- **Candidate TODO:** Give each map point one button accessibility element with
  its name, point type, relevant reached/locked state, and modal-opening action.
  Avoid exposing the circle and visible checkpoint label as duplicate actions.
  Add point-layer tests with labels both shown and hidden.
- [x] **Decision (2026-08-28):** Remediated. Each checkpoint and trivia circle
      is now one named button with its point type and a details-opening hint;
      checkpoints also announce reached or locked state. The visual checkpoint
      label remains touchable but is hidden from the accessibility tree, so it
      does not duplicate the circle action. Focused component tests cover
      reached checkpoints with labels shown, locked checkpoints with labels
      hidden, trivia naming, single-action exposure, and activation. TypeScript,
      ESLint, formatting, and all 340 Jest tests pass.

#### Finding P7-3: The shared text button omits control semantics and state

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Most text commands are announced as text-like accessible elements
  rather than explicitly as buttons, and stateful map/settings choices cannot
  expose selected or expanded state through the shared component. Users may
  hear the visible name but not the control type or current choice.
- **Trigger:** Focus any shared `Button`, including Begin journey, Add, Save,
  Back, Labels, Friends, or map/text-size choices, with a screen reader.
- **Evidence:** `Button` renders `AnimatedPressable` with visible child text but
  no `accessibilityRole`, `accessibilityState`, or accessibility props in its
  public interface. Its `disabled` prop reaches native behavior but is not
  explicitly represented in accessibility state. `IconButton`, `RadioRow`,
  and friend markers demonstrate explicit roles and states elsewhere.
- **Coverage:** Existing UI tests find text buttons by visible text and icon
  buttons by label; they do not assert the shared text button's role, disabled
  state, or selected state.
- **Candidate TODO:** Make `Button` expose button semantics and forward typed
  accessibility label, hint, and state props. Mark stateful choices selected or
  expanded at call sites, and add shared-component tests plus representative
  modal and map assertions.
- [x] **Decision (2026-08-28):** Remediated. The shared `Button` now exposes a
      button role and typed accessibility label, hint, and state props. It
      merges caller state with native disabled state and infers expanded state
      for caret-backed controls. Dropdown and info triggers now expose expanded
      state; theme, map-label-size, text-size, map Labels, and Friends choices
      expose selected state. Focused component tests verify role, label, hint,
      disabled/selected state, and runtime expanded-state changes. TypeScript,
      ESLint, formatting, and all 342 Jest tests pass.

#### Finding P7-4: Manual-entry fields and mode selectors lack accessible context

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Screen-reader and voice-control users cannot reliably distinguish
  the distance/steps value from the time field or determine which input mode is
  selected. The adjacent visual unit text and selected color do not establish
  programmatic names or state.
- **Trigger:** Add or edit a distance entry using VoiceOver, TalkBack, or voice
  control, then identify the numeric field, time field, and Distance/Steps
  selector state.
- **Evidence:** `MilesFooter` and `EditEntryModal` render numeric `TextInput`s
  without labels. `TimeInput` exposes only `testID="edit-time-input"` and a
  sample-value placeholder. Both add/edit mode selectors are plain
  `Pressable`s with visible text but no radio/tab role, group context, or
  selected state. `RadioRow` provides the established selected-control pattern.
- **Coverage:** Manual-entry tests cover validation, persistence calls, and
  repeated taps but do not query fields by accessible name or assert selector
  roles and state.
- **Candidate TODO:** Give every entry field a stable accessible label and
  associate unit/error context where supported. Implement Distance/Steps as a
  named radio or tab group with selected state, reuse it across add/edit flows,
  and add behavior tests using accessibility queries.
- [x] **Decision (2026-08-28):** Remediated. Add and edit numeric fields now
      expose stable Distance or Steps labels with the active distance unit, and
      the edit time field is labeled Time. Validation errors remain polite live
      regions and become alerts when populated; this React Native type surface
      does not support `accessibilityDescribedBy`. The shared
      `ManualEntryModeSelector` exposes a named Entry type radio group with
      selected state and is reused by both flows. Focused tests query the fields
      and selector by accessible name and verify role/state before and after a
      mode change. TypeScript, ESLint, formatting, and all 344 Jest tests pass.

#### Phase 7 rejected candidates

- Save and Add are not unnamed controls: React Native derives accessible names
  from their visible text children. P7-3 concerns missing role/state, not name.
- The orientation-keyed `SharedModalInner` remount is intentional cleanup for
  iOS modal animation stability. No lost edit state or broken navigation was
  demonstrated because edit data is store-owned and the shared modal content
  has no local form state requiring preservation.
- Absence of a global `maxFontSizeMultiplier` is not evidence of a clipping
  defect. Text scaling, wrapping, and landscape layout still require device
  validation, but no reproducible overflow was established statically.
- Native React Native `Modal` provides a separate presentation surface; lack of
  `accessibilityViewIsModal` alone does not prove background focus escapes.
- Manual write rejection and the edit action lock are already owned by P2-3.
  They are not duplicated as a UI finding.
- Short press, caret, chevron, point-color, and modal transitions are bounded.
  The long initial route/progress reveal is covered by the shared P7-1 Reduce
  Motion policy.
- Nested row `Pressable` and `Switch` controls may produce duplicate focus or
  activation on some platform/screen-reader combinations, but static source
  inspection does not establish that runtime behavior.

#### Phase 7 missing high-value coverage

- Physical-device confirmation of manual-entry field and selector semantics.
- Checkpoint and trivia point names, roles, state, and single-action exposure
  with map labels shown and hidden.
- Physical-device confirmation of Reduce Motion before launch and after a
  runtime setting change.
- Modal heading semantics, initial focus, focus restoration, background focus
  containment, and stack navigation announcements.
- Orientation changes while the keyboard, nested modal, sync banner, or
  validation error is active; large-text layout and safe-area extremes.

#### Phase 7 device validation checklist

- [ ] Traverse Welcome, every shared modal, and the edit overlay with VoiceOver
      and TalkBack; verify reading order, headings, focus containment/restoration,
      and back/close announcements.
- [ ] Operate add/edit/delete, settings switches, map labels, trivia points,
      friend markers, sync retry, and destructive confirmations without touch.
- [ ] Enable Reduce Motion before launch and while the app is running; verify
      all continuous and long decorative movement stops without hiding status.
- [ ] Test the largest supported text setting and platform font scale in
      portrait and landscape on small/notched phones and a tablet.
- [ ] Rotate with each keyboard type open and with nested modals, sync banners,
      or validation errors visible; verify controls and footers remain reachable.
- [ ] Attempt rapid repeat activation of add, save, delete, sync, modal back,
      and map point controls while operations and dismiss animations are active.

Phase feedback: all four confirmed Medium accessibility defects are remediated.
Modal stack locking, manual-entry validation, icon-button naming, safe-area
ownership, orientation-aware map bounds, route reveal lifecycle, and friend-
marker semantics showed no additional verified defect. Physical assistive-
technology and large-text validation remains in the device checklist.

### Phase 8: Architecture, DRY, performance, and dead code

Reviewed database mutation and hydration costs, history and statistics
consumers, map geometry/render ownership, foreground timers and listeners,
fitness abstractions, tracking/source classification, Zustand mutation APIs,
and production references to legacy services. Production code remained
read-only.

#### Finding P8-1: Every progress write scans and republishes lifetime history

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Sync and manual writes become progressively more expensive as a
  user's history grows. Each write blocks the serialized database queue while
  SQLite aggregates and sorts all entries, allocates every row in JavaScript,
  and replaces the full Zustand array. Startup and the Distance/Stats modals
  also consume the full history, increasing launch latency and memory use for
  long-running pedometer users.
- **Trigger:** Use pedometer mode while the app is foregrounded. A non-empty
  range can create one durable row every two minutes; those rows are never
  compacted or paged. Every subsequent progress mutation pays work
  proportional to all prior rows.
- **Evidence:** `PEDOMETER_LIVE_COMMIT_INTERVAL_MS` is two minutes and
  `commitPedometerRange` emits one entry for each non-empty segment.
  `Database.applyPedometerSyncChunk`, health sync, reconciliation, and manual
  mutations all finish through `recalculateProgress`, which runs a full-table
  `SUM` and then `readDistanceEntries`. That read selects every row for the
  save and sorts by date. `hydrateProgress` also reads every row even when the
  cached snapshot is valid. The schema has no `(save_id, date)` index.
  `DistanceContent` groups and sorts all entries before slicing seven visible
  days, while `StatsContent` performs additional all-history aggregations.
- **Coverage:** Database tests verify transactional totals and publication but
  use small fixtures. No test or benchmark covers row-count growth, paged
  history, query plans, or mutation cost after a large pedometer history.
- **Candidate TODO:** Keep `distance_entries` authoritative but stop returning
  the entire table from every mutation. Publish committed totals plus row
  deltas, query history by indexed `(save_id, date)` pages, and move aggregate
  statistics to bounded/indexed database queries or maintained summaries.
  Define a compaction policy only if it preserves edit, source-deletion, and
  reconciliation semantics. Add a large-history benchmark and query-plan test.
- [x] **Decision (2026-08-28):** Remediated without compacting authoritative
      history. Mutations now publish totals plus committed row deltas and
      derive totals from the versioned snapshot plus only affected IDs or
      sources inside the same transaction. Missing or invalid snapshots use a
      one-time aggregate repair; stale sync chunks perform no aggregate,
      history, or snapshot work. Startup hydrates totals without rows, health
      sync and reconciliation use bounded ID/range lookups, the Distance modal
      uses stable `(date, id)` keyset pages, Data queries distinct source
      presence, and Stats consumes database-aggregated daily rows. The schema
      now indexes `(save_id, date)`, and obsolete unpaged readers were removed.
      Tests cover index/query shape, paging cursors, daily aggregation,
      rollback, stale writes, and an incremental replacement with 1,000
      unrelated rows. TypeScript, ESLint, formatting, and all 349 Jest tests
      pass.

#### Finding P8-2: Live pedometer display polling has multiple owners and no single-flight guard

- **Severity:** Medium.
- **Confidence:** Confirmed.
- **Impact:** Opening the Distance modal doubles native step-range reads from
  once every two seconds to two independent polls. If a native read takes
  longer than the interval, each hook can start additional overlapping reads,
  increasing bridge, database, CPU, and battery work while stale responses can
  arrive out of order.
- **Trigger:** Use pedometer or dual mode with the map mounted, then open the
  Distance modal. Slow `getStepsBetween` beyond two seconds to expose overlap
  within either mounted hook.
- **Evidence:** `MapScreen` and `DistanceContent` each call
  `useLivePedometerDelta`. Every hook instance immediately calls `refresh`,
  starts its own two-second `setInterval`, and adds its own AppState listener.
  `refresh` is async but has no in-flight or generation guard. The shared
  `PEDOMETER_DISPLAY_REFRESH_MS` constant documents this exact cadence, while
  the hook independently declares `POLL_INTERVAL_MS = 2000`, so timing already
  has two owners.
- **Coverage:** No focused test covers the hook, multiple consumers, a native
  read lasting longer than one interval, out-of-order completion, or cleanup
  during an in-flight read.
- **Candidate TODO:** Move the live delta to one app-scoped, single-flight
  owner and let map/history consumers select the shared value. Use
  `PEDOMETER_DISPLAY_REFRESH_MS` as the sole cadence, prevent overlapping
  reads, discard stale generations after watermark/mode changes, and add
  fake-timer tests for two consumers, delayed completion, foreground refresh,
  and unmount cleanup.
- [x] **Decision (2026-08-31):** Remediated. `App` now mounts the sole live-
      delta owner beside the other app-scoped polling lifecycles. Map and
      Distance consumers select one shared Zustand value and cannot create
      native request loops. The owner uses `PEDOMETER_DISPLAY_REFRESH_MS`,
      permits only one in-flight native read, ignores interval and foreground
      triggers while that read is pending, rejects completions from stale
      watermark/mode generations, resets inactive modes to zero, and removes
      its interval and AppState listener on unmount. Focused fake-timer tests
      cover two consumers, delayed non-overlap, foreground refresh, stale
      completion, and unmount cleanup. TypeScript, ESLint, formatting, app
      integration tests, and all 352 Jest tests pass.

#### Opportunity P8-3: An unreachable placeholder sync subsystem remains public

- **Confidence:** Confirmed.
- **Impact:** `syncService` presents background and real-time synchronization
  APIs that appear usable but are disconnected from the implemented sync
  pipeline; `sync()` always returns "not yet implemented." Keeping the facade
  also forces unused real-time polling methods into both production and mock
  fitness interfaces, creating a second apparent owner for sync scheduling.
- **Evidence:** Language-server reference search finds only the exported
  `syncService` definition. No production or test caller imports it.
  `startRealTimeUpdates` is referenced only by that dead service, and the
  associated `getDistanceToday`, `getDistanceSince`, and
  `getDistanceRecordsSince` APIs have no live caller outside their own chain.
  App-level sync is owned by `useSyncInterval` and the background task.
- **Candidate TODO:** Delete `syncService` and remove the unused real-time and
  convenience-read surface from `FitnessServiceInterface`, its implementations,
  and internal state. Retain only methods used by the active foreground,
  background, and reconciliation pipelines, then run typecheck and focused
  fitness tests.
- [x] **Decision (2026-08-31):** Remediated. The unreferenced `syncService`
      facade was deleted. `FitnessServiceInterface`, the production service,
      and `MockFitnessService` no longer expose the unused real-time polling or
      convenience-read methods, and their orphaned interval/callback state was
      removed. Active bounded record-range, legacy-cutover, permission, and
      availability APIs remain unchanged. TypeScript, ESLint, formatting, 25
      focused fitness/reconciliation tests, and all 352 Jest tests pass.

#### Opportunity P8-4: Public store mutators bypass the durable progress boundary

- **Confidence:** Confirmed.
- **Impact:** `setMiles`, `setSteps`, and `setDistanceEntries` can make Zustand
  disagree with SQLite and `progress_snapshot`, violating the store's stated
  persistence contract if a future caller uses them. They currently add API
  surface without serving production or tests.
- **Evidence:** These actions call Zustand `set` directly rather than a
  database transaction. Language-server reference searches find only each
  interface declaration and implementation. Durable callers use
  `applyDistanceEntryChanges`, sync-specific transaction methods, or
  `resetProgress` instead.
- **Candidate TODO:** Remove the three unreferenced bypass mutators from
  `ProgressStore`. Keep test setup on explicit store-state fixtures and require
  production progress changes to pass through database-owned transactional
  actions.
- [x] **Decision (2026-08-31):** Remediated. `ProgressStore` no longer exposes
      `setMiles`, `setSteps`, or `setDistanceEntries`; their direct Zustand
      implementations were removed. Production progress changes must use the
      database-backed mutation, sync, reconciliation, reset, or snapshot-
      repair actions, while tests continue to initialize state explicitly with
      Zustand's test fixture API. A durability regression test asserts that
      the bypass actions are absent from the public runtime store. TypeScript,
      ESLint, formatting, 10 focused durability tests, and all 353 Jest tests
      pass.

#### Phase 8 rejected candidates

- Tracking-mode checks repeat the same three-value union in several contexts,
  but no copy currently disagrees and the branches intentionally answer
  different questions. A shared predicate may improve readability, but no
  user-visible drift was demonstrated.
- `isSyncedDistanceSource` intentionally classifies every non-manual source as
  synced for forward-compatible deletion and labeling; its test explicitly
  covers an unknown future provider. Replacing it with a closed allowlist would
  change that policy rather than consolidate an accidental duplicate.
- Manual add and edit share validation/conversion utilities but intentionally
  differ in mode-switch and source-preservation behavior. Their similar UI is
  not evidence of a duplicated business rule.
- The App-level health and friend intervals have distinct data sources,
  cadences, and lifecycle contracts, and each has one mounted owner. Their
  coexistence is not duplicate scheduling.
- Friend Progress polling is foreground-gated and reads at most 50 documents
  per request. No unbounded query or demonstrated battery defect was found.
- Map SVG parsing and path-length work are memoized. Sync pulse/shimmer loops
  are conditional on active sync; their accessibility behavior is already
  P7-1, not a separate off-screen resource leak.
- Stats and Distance grouping perform linear work over history, but their
  principal growth source and full-array publication are already owned by
  P8-1. No separate measured render regression justified duplicate findings.
- Development mock history and legacy schema/cutover paths are bounded by
  explicit development inputs or required upgrade compatibility; they are not
  production retention defects or dead code.

#### Phase 8 missing high-value coverage

- Mutation latency, memory, and SQL query plans at realistic multi-year
  pedometer row counts.
- Paged history correctness across add, edit, delete-by-source, reconciliation,
  timezone changes, and concurrent sync publication.
- Single-flight live-delta polling with multiple mounted consumers and delayed
  or out-of-order native responses.
- A repository-wide static unused-export check would prevent future dead
  facades; the progress store now has a focused runtime API guard against
  cache-bypassing actions.

Phase feedback: both confirmed Medium performance/resource defects are
remediated, and both confirmed cleanup opportunities are complete.
Transactional write ownership is enforced by the public store API; map
geometry is memoized; active global sync and display polling hooks have one
app-level owner; and no additional production dead path was verified.

### Phase 9: Test quality and missing failure coverage

Mapped the confirmed findings from Phases 2-8 to their nearest automated
checks, reviewed Jest setup and package scripts, inspected Android unit-test
boundaries, and ran focused coverage for `App.tsx` and `useSyncInterval.ts`.
Confirmed test defects were remediated with focused production fixes where the
new coverage exposed them.

#### Finding P9-1: The App smoke test passes while bootstrap fails

- **Severity:** Medium.
- **Confidence:** Confirmed by execution.
- **Impact:** The primary App test can remain green when database startup is
  broken and the application has entered its initialization-error state. It
  therefore cannot protect the bootstrap ordering and recovery contract that
  gates persisted progress and sync.
- **Trigger:** Run `__tests__/App.test.tsx` with the repository's normal Jest
  setup. The global SQLite mock returns an object with `executeAsync` but no
  `executeSync`, while `Database.createTables` requires `executeSync`.
- **Evidence:** An unsilenced focused run logged
  `Database initialization error: TypeError: this.db.executeSync is not a function`
  and `Failed to initialize app`, then reported both App tests passed. The map
  assertion still succeeds because `MapScreen` is mounted beneath the splash
  and error overlays regardless of bootstrap status. Focused coverage left the
  successful initialization sequence and retry callback uncovered.
- **Coverage:** The suite asserts map controls and delayed spinner rendering;
  it does not await readiness, reject unexpected initialization errors, assert
  the error overlay, or exercise retry success.
- **Candidate TODO:** Give the App suite an explicit database boundary with a
  valid success double and fail on unexpected `console.error`. Assert that the
  splash remains until settings/progress/tracking hydration completes, then add
  failure and retry tests proving controls are not treated as readiness while
  the error overlay is active.
- [x] **Decision (2026-08-31):** Remediated. The global SQLite Jest double now
      implements the synchronous query boundary used by production startup.
      The App suite replaces database, settings, progress, and tracking
      bootstrap dependencies with explicit controlled success doubles, awaits
      the initialization store's ready phase before treating map controls as a
      successful smoke test, and fails successful paths on unexpected
      `console.error`. Focused tests prove the splash remains through settings,
      progress, and tracking hydration; a database rejection exposes the error
      overlay while phase remains loading; and pressing Retry completes a
      second attempt and removes the error state. TypeScript, ESLint,
      formatting, seven focused App tests, and all 355 Jest tests pass.

#### Finding P9-2: The sync-hook suite does not execute the sync hook

- **Severity:** Medium.
- **Confidence:** Confirmed by source inspection and coverage.
- **Impact:** A suite named `useSyncInterval.test.ts` stays green when the
  operational hook's scheduling, single-flight guard, timeout/retry behavior,
  status publication, AppState transitions, pedometer branch, or iOS
  Background Refresh logic regresses. This creates false confidence around the
  highest-risk synchronization coordinator.
- **Trigger:** Change any behavior inside `useSyncInterval` while preserving
  the three pure `healthSyncCutover` helper functions imported by its test.
- **Evidence:** The test file imports only `getHealthLookbackStartForChunk`,
  `getHealthSyncFormatForChunk`, and `getHealthSyncStartTimestamp` from
  `healthSyncCutover`; it never imports or renders `useSyncInterval`. Focused
  coverage reports 18.4% statement coverage for `useSyncInterval.ts`, with
  `requestSyncNow`, `withTimeout`, `performPedometerSync`, lifecycle effects,
  and nearly every operational branch uncovered. The covered lines are reached
  indirectly while rendering App, not by hook assertions.
- **Coverage:** Cutover arithmetic is well covered in the mislabeled file, but
  no test owns the hook's public lifecycle contract.
- **Candidate TODO:** Rename the existing suite for `healthSyncCutover` and add
  a real `renderHook` suite for `useSyncInterval`. Use controlled promises and
  fake timers to cover initialization gating, one in-flight sync, timeout and
  retry, cursor preservation on failure, foreground/background transitions,
  manual requests, unmount cleanup, and platform-specific issue publication.
- [x] **Decision (2026-08-31):** Remediated. Pure cutover arithmetic now lives
      in `healthSyncCutover.test.ts`, while a real hook lifecycle suite renders
      `useSyncInterval` with controlled provider promises and fake timers. The
      suite covers initialization gating, concurrent manual/foreground
      triggers behind one in-flight operation, timeout without retry or cursor
      advance, one settled transient retry, AppState polling and foreground
      refresh, unmount cleanup, permission publication and sync disablement,
      and pedometer failure with watermark preservation. The readiness test
      exposed and fixed a production bypass: `requestSyncNow()` could run
      during initialization because only automatic scheduling was gated.
      `performSync` now enforces readiness for every trigger. Both focused
      suites pass all 16 tests; TypeScript, ESLint, formatting, diagnostics,
      and all 362 Jest tests pass.

#### Highest-value missing automated boundaries

1. **Persistence and manual recovery (P2-1, P2-2, P2-3):** No test interrupts
   initialization after the `steps` column is added but before backfill, proves
   destructive deletion and bookmark reset roll back together, or rejects each
   manual add/edit/delete write and retries it from retained UI state.
   **Candidate TODO:** Add a stateful SQLite migration double, a database-level
   destructive-reset transaction test, and component rejection/retry tests.
2. **Clock and commit concurrency (P3-1, P3-2):** Current pedometer tests cover
   isolated windows, rollback, midnight splitting, and pruning, but not a
   backward clock transition or independently triggered commits completing out
   of order. **Candidate TODO:** Add controlled-clock and deferred-promise tests
   at the shared commit/database boundary, then verify the native wall-clock
   behavior on Android.
3. **Native lifecycle completion (P4-1, P4-2):** JavaScript tests do not prove a
   Headless task rejection maps to WorkManager retry, and Android tests cover
   only sample persistence/pruning. Splash tests do not interrupt a fade with
   a restarted bootstrap. **Candidate TODO:** Add a JS background-task outcome
   suite, a Robolectric/WorkManager completion test, and a fake-timer Splash
   `false -> true` interruption test.
4. **iOS build and capability truth (P5-1, P5-2):** No automated lane builds an
   unsigned Debug simulator target or checks that advertised background
   recovery corresponds to a registered execution capability.
   **Candidate TODO:** Add an Xcode simulator build gate with explicit Debug
   Firebase expectations and hook tests for supported versus unavailable
   background behavior; retain physical HealthKit/App Attest validation.
5. **Firebase security and disclosure (P6-1 through P6-4):** Service tests use
   useful dependency injection for workflow order, and static tests compare
   affinity/field lists, but no cold-start fetch holds Auth hydration pending,
   no emulator executes Rules predicates, and no release check reconciles the
   Firestore schema with privacy declarations or App Check enforcement.
   **Candidate TODO:** Add the delayed-Auth test, Java-21 Rules emulator tests,
   a schema-to-disclosure static check, and an attested/unattested release gate.
6. **Accessibility behavior (P7-1 through P7-4):** Reduce Motion, map-point,
   shared text-button, and manual-entry tests now cover their role/name/state
   contracts. Retain VoiceOver, TalkBack, Dynamic Type, focus, rotation, and
   safe-area device checks.
7. **Scale and polling ownership (P8-1, P8-2):** Small fixtures cannot expose
   lifetime-history query growth, and no hook test mounts two live-delta
   consumers or delays a native read past the polling interval.
   **Candidate TODO:** Add realistic-history query-plan/latency tests and a
   fake-timer single-flight polling suite with stale-response assertions.

#### Phase 9 rejected candidates

- Mock-call assertions in `pedometerCommit.test.ts` are appropriate for that
  service boundary; database rollback and Zustand publication are tested in
  separate focused suites. Requiring every unit test to exercise all three
  layers would duplicate setup without improving fault localization.
- `settingsStore.test.ts` does cover failed bookmark and sharing persistence
  without publishing memory. The exploratory claim that writes always succeed
  was stale.
- SharedModal already tests repeated Back presses. No pending-entry commit is
  owned by that component, so the proposed double-commit test targeted behavior
  that does not exist there.
- The global Firebase mocks do not by themselves invalidate the injected
  friend workflow/service tests. Their limitation is the absent Rules/Auth
  integration boundary recorded above, not that every Firebase unit test is a
  false positive.
- The App fake-timer test restores real timers after unmount and is currently
  last in its file. Moving restoration to `afterEach` would improve resilience
  to assertion failure, but no present cross-test contamination was observed.
- Lack of a global coverage percentage threshold is not independently a
  defect. Critical contract ownership and mutation resistance matter more than
  maximizing repository-wide line coverage.
- `npm test` is the documented release command and includes root, hook,
  component, screen, service, store, constant, and utility tests. The narrower
  `test:unit` script does not silently replace it in the release checklist.

#### Device and external-system validation that remains non-automatable locally

- Physical clock rollback and reboot/process-death interaction with Android's
  hardware step counter and foreground service.
- OEM service survival, notification permission behavior, and real WorkManager
  scheduling under battery restrictions.
- Health Connect and HealthKit permission/read behavior, provider timeout and
  cancellation characteristics, and long-history query performance.
- VoiceOver/TalkBack focus, announcements, Reduce Motion, Dynamic Type,
  keyboard, rotation, and safe-area behavior on supported form factors.
- Firebase Console App Check enforcement, attestation from signed builds, and
  store/privacy disclosure review.

Phase feedback: both confirmed Medium test-quality defects are remediated.
Existing tests are strongest around pure transformations, transactional
rollback, source reconciliation, sharing workflow ordering, store publication,
bootstrap recovery, and sync lifecycle. The highest residual risk lies at
native/configuration, physical accessibility, clock/concurrency, and scale
boundaries.

### Phase 10: Final triage report

This review found no Critical defects. It confirmed 20 defects: one High,
sixteen Medium, and three Low. It also recorded five maintenance/performance
opportunities and one external release-state validation item. Test gaps are
listed separately and do not increase the defect count; P9-1 and P9-2 are
counted as defects because the existing suites actively report success while
failing to exercise the behavior they claim to cover. All 20 confirmed defects
and all five opportunities are remediated; the external production-state item
is verified.

The findings below retain their phase severities. Remediation priority is based
on data integrity, release scope, dependency order, and the ability to verify a
fix, rather than severity alone.

#### Confirmed defects

##### Priority 0: Data integrity and release gates

1. **Pedometer integrity — P3-1 (High, resolved) and P3-2 (Medium, resolved).**
   Native samples use monotonic time, boot identity, and insertion-ordered
   cursors; database compare-and-swap and the process-wide commit queue prevent
   stale windows from replacing newer progress or regressing the watermark.
2. **Persistence transactions — P2-1 and P2-2 (Medium, resolved).** Migration
   backfill is independently idempotent, and database-owned destructive
   transactions coordinate entry deletion, snapshot rebuilding, and bookmark
   reset without partial commits.
3. **Cloud disclosure — P6-2 (Medium, resolved).** The plain-language consent
   already identifies the meaningful shared data, audience, and deletion
   controls. The iOS privacy manifest now formally declares Name, User ID, and
   Fitness as linked, non-tracking data used for app functionality. Store
   declarations are needed only if the app is submitted to a store.
4. **iOS development gate — P5-2 (Medium, resolved).** Unconfigured Debug
   builds explicitly disable Firebase-dependent features, while non-Debug
   builds remain strict. The unsigned generic-simulator Debug build passes.

##### Priority 1: Reliability and accessible core workflows

1. **Background completion — P4-1 (Medium, resolved).** Request-scoped
   JavaScript outcomes now map retryable Headless failures to WorkManager
   retry, while normal and intentional no-work completion remain successful.
2. **Manual write recovery — P2-3 (Medium, resolved).** Add/edit/delete failures
   retain user input, release action locks, expose visible retryable errors, and
   permit a successful retry.
3. **Accessibility primitives and consumers — P7-1 through P7-4 (Medium,
   resolved).** Reduce Motion ownership, accessible map-point actions, shared
   text-button semantics, and labeled manual-entry controls with selected mode
   state are implemented. Perform device screen-reader validation.
4. **iOS capability truth — P5-1 (Medium, resolved).** The unsupported
   Background App Refresh warning, recovery claim, native bridge, and project
   references are removed while Apple Health sync remains foreground-only.
5. **Critical test foundations — P9-1 and P9-2 (Medium, resolved).** The App
   suite now owns a valid SQLite success boundary and explicit bootstrap
   readiness, failure, and retry coverage. Cutover arithmetic has its own pure
   suite, and a real `useSyncInterval` lifecycle suite protects scheduling,
   concurrency, failure, AppState, cleanup, and pedometer behavior.

##### Priority 2: Bounded correctness and resource risks

1. **History scaling — P8-1 (Medium, resolved).** Mutation publication is
   delta-based, startup is totals-only, history is keyset-paged, and statistics
   consume database-aggregated daily rows. Indexed query-shape and large-
   history regression coverage preserves edit, source-deletion,
   reconciliation, and aggregate semantics.
2. **Live-delta ownership — P8-2 (Medium, resolved).** Map and Distance select
   one shared value from an app-scoped, single-flight producer with stale-
   generation rejection and focused scheduler coverage.
3. **Splash retry race — P4-2 (Low, resolved).** Splash owns and cancels its
   active fade, remains input-blocking while loading, and cannot be hidden by a
   stale completion callback.
4. **Sharing cold start — P6-1 (Low, resolved).** Fetch, distance publication,
   and profile updates now await the same Auth-ready boundary used by enable
   and delete operations.
5. **Rules/client name parity — P6-3 (Low, resolved).** Firestore Rules now
   require a nonblank trimmed display name, matching client writes and reads;
   static parity coverage is in place, while emulator coverage awaits Java 21.

#### Deduplicated remediation bundles

1. [x] **Pedometer and sync ownership:** P3-1, P3-2, P3-3, P4-1, P8-2,
       and P9-2 are complete. Monotonic native sampling, serialized durable
       commits, Worker outcome propagation, single-owner live polling, bounded
       timeout behavior, and executable hook lifecycle coverage now reinforce
       the same ownership model.
2. [x] **Persistence and recovery:** P2-1, P2-2, P2-3, P4-2, and P9-1 are
       complete. Idempotent migration recovery, atomic destructive commands,
       retryable manual writes, Splash cancellation, and trustworthy bootstrap
       tests cover the persistence/recovery path.
3. [x] **iOS, Firebase, and privacy:** P5-1, P5-2, P6-1, P6-2, P6-3, and
       P6-4 are complete. The build baseline, capability claims,
       Auth/Rules/schema disclosures, and Firestore App Check production state
       are reconciled. Physical iOS App Attest validation remains a release
       gate.
4. [x] **Accessibility:** P7-1 through P7-4 are remediated in code and
       automated tests. Complete interaction-model validation with assistive
       technologies remains a physical-device gate.
5. [x] **History architecture:** P8-1, P8-3, and P8-4 are complete.
       Delta publication, bounded lookups, keyset paging, and database daily
       aggregates preserve authoritative history; dead sync APIs and
       cache-bypassing store actions are removed.

#### Remediation coverage and residual gates

The remediation coverage below was added as failing-first regression coverage
unless the boundary requires a physical device or external system.

1. [x] Interrupted migration after successful `ALTER TABLE`, followed by retry
       and verified backfill (P2-1).
2. [x] Atomic destructive deletion, snapshot rebuild, bookmark reset, and
       overlap exclusion (P2-2).
3. [x] Manual add/edit/delete rejection, retained input, lock release, visible
       recovery, and successful retry (P2-3).
4. [x] Backward clock changes and out-of-order commits proving no omitted
       steps, row replacement, or cursor regression (P3-1, P3-2).
5. [x] Headless JS failure mapped through native completion to WorkManager
       retry, plus no-work success (P4-1).
6. [x] Splash fade interruption and App bootstrap success, failure, and retry
       with unexpected console errors treated as test failures (P4-2, P9-1).
7. [x] A real `useSyncInterval` lifecycle suite covering readiness gates,
       single-flight behavior, timeout/retry, AppState, manual requests, cursor
       preservation, cleanup, and platform issue publication (P9-2).
8. [x] Cold Auth restoration, Rules/client schema parity, and
       schema-to-disclosure checks (P6-1 through P6-3). Executable Rules
       emulator coverage remains an external-system gate.
9. Physical VoiceOver and TalkBack validation of the automated role/name/state
   contracts for P7-1 through P7-4.
10. [x] Multi-year history query plans and two-consumer delayed live-delta
        polling with stale-response rejection (P8-1, P8-2). Lower-end-device
        latency and battery profiling remain release validation.

#### Maintainability and performance opportunities

- [x] **P1-1:** Generated Android and coverage reports are excluded from
      ESLint; maintained source and tests remain covered.
- [x] **P1-2 (app-owned work):** App Gradle properties use Gradle
      10-compatible assignment syntax. Remaining warnings belong to installed
      dependencies and should be tracked through upgrades rather than local
      patches.
- [x] **P3-3:** Installed provider APIs have no cancellation contract; timeout
      no longer retries an unresolved native read, while settled transient
      failures retain one delayed retry.
- [x] **P8-3:** The placeholder `syncService` and its unused real-time and
      convenience fitness API surface are removed.
- [x] **P8-4:** Unreferenced `setMiles`, `setSteps`, and `setDistanceEntries`
      actions are removed from the durable progress store boundary.

#### Device, external-system, and release validation

- **P6-4 / Firebase:** Firestore enforcement, App Check API state, attested
  Release and registered Debug access, and the Release sharing lifecycle are
  verified. A direct unattested-client rejection test remains useful defense-in-
  depth validation but is no longer an unresolved production-state conflict.
- **iOS:** Archive Release, validate Firebase and App Attest, exercise HealthKit
  permission and long-history reads, and test foreground/resume, force-quit,
  clock/timezone, and modal lifecycle on physical hardware. Do not describe
  background Apple Health sync unless a real execution path is implemented.
- **Android:** Exercise backward clock changes, reboot/process death,
  WorkManager retry, foreground-service startup, permission revocation, and OEM
  battery restrictions on physical devices.
- **Accessibility:** Validate VoiceOver and TalkBack focus/order/actions,
  Reduce Motion before launch and at runtime, Dynamic Type, keyboard/rotation,
  and safe areas on supported phone/tablet form factors.
- **Performance:** Profile a realistic multi-year history and stalled provider
  reads on lower-end hardware before setting latency or battery thresholds.

#### Final disposition

- **Release-neutral maintenance:** P1-1, P1-2, P8-3, and P8-4 are complete.
  P3-3's bounded retry behavior is also complete.
- **Android release:** The confirmed code defects are remediated. Complete the
  Android physical-device, WorkManager, permission, and OEM battery gates
  above.
- **iOS release:** The confirmed code/configuration defects are remediated.
  Release archive, Firebase/App Attest, HealthKit, and physical-device gates
  remain blocking validation.
- **Cross-platform release:** Persistence, recovery, accessibility, and test
  foundation defects are remediated. Physical assistive-technology validation,
  external Rules-emulator coverage, and realistic-device performance remain.

Phase feedback: Phase 10 is complete. All 20 confirmed defects and all five
maintenance/performance opportunities are remediated, and the external
production-state conflict is verified. Remaining work is release assurance on
physical devices and external systems, not an open reviewed code defect.
