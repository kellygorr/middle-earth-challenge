# Adversarial Code Review

Read-only review of the current codebase. Review one phase at a time, record
verified findings here, and report progress after every phase. Do not make code
changes during this review.

## Status

- [x] Phase 0: Create review tracker
- [ ] Phase 1: Establish baseline
- [ ] Phase 2: Progress and persistence
- [ ] Phase 3: Health and pedometer sync
- [ ] Phase 4: Friend sharing and Firebase
- [ ] Phase 5: App lifecycle and concurrency
- [ ] Phase 6: UI state and modal workflows
- [ ] Phase 7: Native Android lifecycle
- [ ] Phase 8: Tests and maintainability
- [ ] Phase 9: Final triage report

## Process

For each phase:

1. Inspect only the named surface and its nearest tests/callers.
2. Record concrete risks with file references and evidence.
3. Classify each finding as Critical, High, Medium, or Low.
4. Note missing tests separately from confirmed bugs.
5. Run focused checks when they can confirm or reject a suspected issue.
6. Mark the phase complete and report the result before starting the next one.

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

## Findings

No findings recorded yet.

## Review Log

### Phase 0

Created this tracker so review progress is visible and resumable.
