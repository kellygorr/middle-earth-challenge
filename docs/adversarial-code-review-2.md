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
- [ ] Phase 1: Establish baseline
- [ ] Phase 2: Persistence and transactional integrity
- [ ] Phase 3: Health, pedometer, and source reconciliation
- [ ] Phase 4: App lifecycle, concurrency, and native boundaries
- [ ] Phase 5: iOS readiness and platform parity
- [ ] Phase 6: Friend sharing, Firebase, privacy, and release configuration
- [ ] Phase 7: UI workflows, map behavior, and accessibility
- [ ] Phase 8: Architecture, DRY, performance, and dead code
- [ ] Phase 9: Test quality and missing failure coverage
- [ ] Phase 10: Final triage report

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
Do not create remediation TODOs until the findings are deduplicated by root
cause and prioritized.

## Review Log

### Phase 0: Tracker created

Created a second-round tracker using the first review, completed TODO items, and
`adversary cleanup 1` as the baseline. Added explicit lenses for disciplined
DRY analysis, ownership, dead code, performance, accessibility, privacy,
release configuration, test quality, and regression/incomplete-fix detection.
