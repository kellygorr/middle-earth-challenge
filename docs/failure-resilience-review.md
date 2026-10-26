# Failure Resilience Review

Read-only review of the current codebase, focused on one question: **when
something fails — a native call, a network request, a disk write, a migration,
a permission revoke — does the app stay usable, or does it get stuck, corrupt
its state, or silently misrepresent reality to the user?**

The two prior adversarial reviews (`adversarial-code-review.md`,
`adversarial-code-review-2.md`) asked "is this code correct?" and "did the
cleanup regress anything?". This review asks a narrower, different question:
**assuming any single operation in this list can fail, hang, or return garbage,
what happens next?** Treat every `await`, every native module call, and every
network/database write as a potential failure point, not just the ones that
already have a visible `catch`.

Do not make code changes during the review. Record findings here as they are
confirmed, with file:line evidence and a concrete repro. Classify each as
Critical / High / Medium / Low. A phase is complete when every file in its
scope has been read (not grepped) and every async boundary in it has been
traced to its failure/timeout/cancellation behavior.

## Status

- [ ] Phase 0: Establish baseline
- [ ] Phase 1: Bootstrap and first-launch migration
- [ ] Phase 2: Native module boundaries (pedometer, health, file transfer)
- [ ] Phase 3: Persistence and transactional writes
- [ ] Phase 4: Network/cloud sync (Firestore, Health Connect/Apple Health)
- [ ] Phase 5: Timers, retries, and in-flight guards
- [ ] Phase 6: User-visible failure surfaces
- [ ] Phase 7: Final triage report

## Review lenses

Apply each of these to every phase, not just the phase it's listed under.

**Does the failure stay contained, or does it cascade?** A single failed step
should degrade one feature, not the whole app. Trace what depends on the
failing call's result: does a `getEnvironment()` timeout only disable
pedometer tracking, or does it also block the splash screen forever because
the caller `await`s it inline with the rest of bootstrap?

**Can a failure be waited on forever?** For every `await`, ask: what enforces
an upper bound on how long this can take? If the answer is "nothing", that's a
finding, regardless of how unlikely the hang seems. Native calls, especially
on Android after an OS/app update (permission re-grants, WorkManager
rescheduling, cold service starts), are exactly the class of call that can
stall far longer than in any test environment.

**If a timeout is added, does it actually stop the operation, or just stop
waiting for it?** `Promise.race`-style timeouts commonly used to "fix" a hang
do not cancel the underlying call — the abandoned operation can still resolve
later and mutate state the app has already moved past (see: a stale tracking
mode switch landing after the user is on the map screen). A timeout without
real cancellation can turn a slow-but-safe hang into a fast-but-unsafe race.
Flag any timeout that isn't paired with genuine cancellation of the operation
it wraps.

**Does a retry make forward progress, or does it silently repeat the same
failure forever?** Distinguish "retry with no state change" (will fail
identically forever) from "retry after a state change that could plausibly fix
it" (worth retrying) from "retry that could now do the wrong thing because
state has moved on since the first attempt" (worse than not retrying).

**What does "recoverable" actually mean here?** Several bootstrap/service
steps are explicitly marked recoverable (caught, logged, swallowed). For each
one: recoverable *into what state*? Does the rest of the app know that step
didn't complete, or does it assume success because no exception propagated?

**Does a partial write leave two stores of truth disagreeing?** This app has
at least three places state can partially persist: SQLite (local), Firestore
(cloud/social), and Zustand stores (in-memory). A failure between step N and
N+1 of a multi-step write can leave any two of these disagreeing. For each
multi-step write: what's the actual state after each individual statement
fails, not just after the whole operation fails?

**Is "the operation succeeded" ever inferred rather than confirmed?** Look for
code that treats "no error was thrown" as "the thing definitely happened",
when the underlying native/network layer might report success optimistically
(e.g., a write is queued locally before it reaches a server).

**Does the user find out, and can they act on it?** For every failure path:
what does the user actually see, how long until they see it, and is the
message specific enough to be actionable? A single "sync failed" slot that
silently overwrites an earlier, different error is a finding even if the
underlying failure was handled correctly.

**Would a fix here plausibly make a currently-invisible failure into a
visible, worse one?** When proposing a fix, explicitly check whether the fix
converts a slow/degraded-but-safe path into a fast/broken one. Prefer
"degrade visibly and stay safe" over "hide the failure and hope it resolves
itself."

## Phase 0: Establish baseline

- Record the current branch/working-tree state without modifying anything.
- Run the full test suite, `tsc --noEmit`, and lint; note pre-existing
  failures separately from anything discovered by this review.
- Read `docs/adversarial-code-review.md` and `docs/adversarial-code-review-2.md`
  for prior findings already fixed — do not re-litigate those unless there's
  evidence of regression.

## Phase 1: Bootstrap and first-launch migration

Review:

- `App.tsx` (`runRecoverableBootstrapStep`, `runRequiredBootstrapStep`,
  the full `initApp` sequence)
- `src/services/database.ts` (`init`, `createTables`, `runSchemaMigrations`,
  `migrateWithSnapshotProtection`, `createPreMigrationSnapshot`,
  `restoreFromPreMigrationSnapshot`)
- `src/services/trackingModeService.ts` (`ensureTrackingModeRunning`)
- `src/services/firebaseAppCheck.ts`

Focus: what happens if any bootstrap step hangs indefinitely rather than
throwing (see the "can a failure be waited on forever?" lens above — this is
the app's actual open question from tonight's investigation into an
unexplained minute-long update-launch stall). What happens if the pre-migration
snapshot/restore mechanism itself fails (disk full during `VACUUM INTO`,
`ATTACH` fails because the snapshot file is corrupt)? Does a required step's
failure correctly and permanently block the app in a retry-capable error
state, or can the app end up half-initialized?

## Phase 2: Native module boundaries

Review:

- `src/services/pedometerService.ts` and native Android pedometer service
- `src/services/fitnessService.ts` (Health Connect / Apple Health)
- `src/services/journeyDataTransfer.ts` and
  `android/**/JourneyDataTransferModule.kt`
- Any `NativeModules.*` call site

Focus: every native call is a boundary the JS layer cannot fully verify — it
can throw, hang, or return a value that lies about what actually happened on
the native side (e.g., a write reported successful before it's durable, a
service reported running that the OS is about to kill). For each native call:
what does the JS layer assume about the native side's guarantees, and is that
assumption checked anywhere or just trusted?

## Phase 3: Persistence and transactional writes

Review:

- `src/services/database.ts` — every method that performs more than one
  `executeSync` call
- `src/stores/progressStore.ts`, `src/stores/settingsStore.ts`

Focus: which multi-statement writes are wrapped in `runTransaction` and which
aren't; for the ones that aren't, what does the database look like after
statement K of N fails? Cross-check against `enqueueWrite`'s write-queue
serialization — does a failed write correctly unblock the queue for the next
one, or can a stuck promise stall every subsequent write?

## Phase 4: Network/cloud sync

Review:

- `src/services/friendProgressService.ts`, `friendProgressWorkflow.ts`
- `src/hooks/useSyncInterval.ts`, `useFriendProgressSync.ts`
- `firestore.rules`

Focus: offline/airplane-mode behavior, partial sync chunk failures, what
happens if a Firestore write is queued locally (`waitForPendingWrites`) but
the app is killed before it flushes, and whether retry logic can double-apply
a change that actually did succeed server-side but whose local ack was lost.

## Phase 5: Timers, retries, and in-flight guards

Review every module-level `let ...InFlight`, re-entrancy counter, or
`setTimeout`/`setInterval` across the codebase (grep for these patterns
directly rather than relying on file-by-file memory).

Focus: does every in-flight guard get reliably cleared on both success and
failure (including a killed/backgrounded app)? Can two logically-different
operations share one guard and block each other incorrectly? Does a timer
cleanup path run on every possible exit, including early returns?

## Phase 6: User-visible failure surfaces

Review:

- `src/components/SyncErrorBanner.tsx`
- Troubleshooting issue plumbing in `progressStore.ts`
- Any `Alert.alert` / error-banner call site

Focus: single-slot error state that drops a second concurrent failure;
messages that name the wrong cause because the check that would disambiguate
it wasn't run; failures that resolve silently without ever clearing the stale
banner that described them.

## Phase 7: Final triage report

- Group findings by root cause, not just by file — a cluster of similar
  findings across modules usually means one missing pattern (e.g., "no native
  calls have timeouts") rather than several unrelated bugs.
- For each finding, state not just what's wrong but what "handled correctly"
  would look like, in concrete terms (bounded wait + real cancellation + a
  user-visible, specific message), so a fix can be judged against it.
- Explicitly list anything checked and found already-correct, not just
  problems — a reviewer that only reports findings makes it impossible to
  tell what was actually verified versus skipped.
