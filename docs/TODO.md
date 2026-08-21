# TODO

Ongoing list of deferred work items outside a specific release scope.

---

## Modal size ✅ done

`SharedModal` centrally owns responsive sizing for every stack modal. Portrait
modals share a 90% height limit and 540px regular width; checkpoint/info content
uses the intentional 440px narrow variant. Landscape sizing is constrained by
one shared percentage, minimum, and maximum. `pushModal` callers provide only
the modal type and cannot set ad hoc dimensions.

---

## Persist step count in `progress_snapshot` ✅ done

Landed alongside the total-steps chip on the map. `progress_snapshot`
now stores `{ id, miles, steps, last_updated }`; `progressStore`
mirrors both fields and every writer keeps them in sync. MapScreen
reads `store.steps` directly (O(1)) instead of reducing over
`distanceEntries`. Live pedometer delta (open range since
`lastSyncTimestamp`) is added on top for a smoothly-ticking counter.

---

## Sync screen: subtitle under tracking-mode radio tiles ✅ done

Both radio rows now surface a bold **Speed:** inline label so users
can see the immediate-vs-batched contrast at a glance:

- **Pedometer** — 3-line description ending with **Speed:** Immediate.
- **Health Connect** — 3-line description: what it does, how data
  flows (fitness app → Health Connect → us, batched by Android), and
  **Speed:** Not immediate — depends on how often the fitness app
  shares data. The upside: your Health Connect data is only accessed
  when using the app.

The "built into Android 14+ / installable from Play Store"
availability note moved to a helper line below Required Access, where
it acts as setup info rather than a decision factor.

Added `captionSecondaryBold` typography variant to render the inline
**Speed:** label.

---

## Add step counts to Stats screen ✅ done

Stats uses the cumulative step snapshot for completed progress and each
entry's stored `steps` value for best day, weekly totals, and daily averages.
Measured steps are preserved when health providers supply them; distance-only
entries retain their derived step fallback.

---

## Consider adding steps to checkpoints & trivia ✅ done

Decision: keep checkpoint and trivia unlocks distance-based. Miles/kilometers
are sufficient for journey progression, so step-specific gates are not needed.

---

## Adversarial code review ✅ done

Completed as a nine-phase read-only review. The prioritized findings and
remediation batches are in `docs/adversarial-code-review.md`.

---

## Revoke access (pedometer) only revokes one item ✅ done

Turning the source off stops the foreground service, cancels WorkManager
sweeps, and clears the reboot-resume flag. The revoke section lists Physical
activity, Notifications, and stock battery optimization, with an App Settings
action for those OS-managed grants. A separate OEM Battery Settings action is
shown on affected manufacturers for auto-start/background-manager access.

---

## App Check token auto-refresh resolves differently per build variant

`src/services/firebaseAppCheck.ts` passes `isTokenAutoRefreshEnabled: true` for
every build, but the native module reports different values on device:

- Release (`com.middleearthchallenge`): `isAppCheckTokenRefreshEnabled final
  value: true`
- Debug (`com.middleearthchallenge.debug`): `isAppCheckTokenRefreshEnabled final
  value: false`

Both lines are logged by `RNFBAppCheck` during native startup, before JS calls
`initializeAppCheck`, so they reflect a manifest/`RNFBMeta` default rather than
the JS option. What is not established is whether the JS option later overrides
the native default, or whether the debug variant genuinely runs without
background refresh.

This mattered less while App Check was in monitor mode. Now that Firestore
enforcement is on, a debug session that outlives the 1-hour App Check token TTL
could start failing mid-session with `PERMISSION_DENIED` if refresh really is
off. Neither variant hit this during device validation on 2026-08-19, because
each token was fresh.

Investigate by checking the merged debug manifest for
`firebase_app_check_token_auto_refresh`, then confirm token renewal by holding a
debug session past the TTL and watching for a second token exchange.

---

## No transactional database failure-recovery tests

The sync and commit suites mock `useProgressStore` and `database`, so they
prove the right calls are made with the right payloads — not that persistence
agrees. Nothing exercises a real SQLite failure path.

This is the first item in the adversarial review's own test-priority order and
the largest remaining coverage gap. The findings it would have caught are real
ones already fixed by inspection rather than by a failing test: swallowed write
errors, memory/snapshot divergence, and partial commits.

Worth covering:

- `applyDistanceEntryChanges` rejecting mid-transaction leaves entries and the
  progress snapshot consistent, and the store is not updated
- A failed `persistMilesSnapshot` does not leave Zustand ahead of the database
- Hydration repairs a snapshot that disagrees with the entries it was derived
  from
- `commitPedometerRange` does not advance the watermark when the write rejects
  (currently asserted against a mock)

Needs a real `op-sqlite` instance in Jest, or a thin in-memory adapter behind
the same interface. Decide which before writing the tests — mocking the mock is
what produced this gap.

---

## `App.test.tsx` "renders correctly" asserts an almost-empty tree

`SafeAreaProvider` renders nothing until it measures a native layout, which
never happens under Jest. The app tree is mounted inside it, so the smoke test
has been passing without exercising any screen.

Mocking `react-native-safe-area-context` globally makes the test render the real
map, which then fails on mocks that were never needed before:

- `react-native-reanimated`: `useAnimatedReaction`, `useEvent`, `useHandler`
  (the last two are pulled in by `react-native-gesture-handler`)
- `@shopify/react-native-skia`: `Skia.ContourMeasureIter`, and likely more
  behind it

The reanimated gaps are already filled in `jest.setup.js`. The safe-area mock is
deliberately scoped to `src/screens/__tests__/SharedModal.test.tsx` so it does
not change what other suites render.

To finish: stub the Skia surface the map needs, move the safe-area mock into
`jest.setup.js`, and give the smoke test a real assertion about what rendered.

---

## Verify direct distance writes on device

The `pendingEntries` / `pendingDeletions` staging buffer was removed; adding,
editing, and deleting distance now write straight to SQLite through
`applyDistanceEntryChanges`.

The unit tests mock `useProgressStore`, so they prove the right call is made
with the right payload — not that SQLite agrees. Nothing currently exercises the
real database layer.

To verify on a device:

- Add miles and add steps; confirm the total updates immediately
- Edit an entry's value and its date; confirm the row updates in place rather
  than duplicating (the write is an upsert on the same id)
- Delete an entry; confirm the total drops
- Force-quit after each and confirm the change survived
- Repeat with the Distance modal opened from the Hobbiton checkpoint, exiting
  via Back rather than Close

---

## Native step-sample pruning SQL is untested

`StepCounterDbHelper.pruneSamplesBefore` deletes raw samples older than the
retention cutoff while keeping the newest pre-cutoff sample per `boot_id`. That
anchor is what `readStepsBetween` subtracts from, so if the SQL drops it, the
next window reports every step taken since boot instead of the window's steps.

The Jest tests only prove `commitPedometerRange` calls the native method with
the right cutoff — they would pass even if the SQL deleted the entire table.
There is no Android instrumentation test target in this project.

To verify, either:

- add an `androidTest` target and cover: prune with samples spanning two boots,
  prune with nothing older than the cutoff, and a `readStepsBetween` query
  immediately after a prune that crosses a boot boundary; or
- run pedometer mode on a device for longer than
  `PEDOMETER_SAMPLE_RETENTION_MS` (7 days) and confirm daily step totals stay
  plausible rather than spiking

The failure mode is a wildly inflated step count, so it would be obvious.

---

## Manual entry input rejection has no user feedback

`MilesFooter` and `EditEntryModal` reject input that is not a finite positive
number (`Number.isFinite`, which unlike `isNaN` also catches `Infinity` from
input like `1e400`). The rejection is a bare `return`, so the button appears to
do nothing and the user gets no explanation.

There is deliberately **no upper bound** on distance. Large values are valid —
if someone enters five million miles they reach Mordor, and that is fine. Do
not add a cap.

To finish:

- Show an inline message when input is rejected, covering both empty/invalid
  text and non-finite values
- Decide how very large but finite values should display in the UI (progress
  bar, stats, projections) rather than restricting what can be entered

---

## Unmount/rotation cleanup is untested

Batch 5 added cleanup for deferred UI work, none of it covered by tests:

- `useAnimatedModal` cancels the queued entrance frame and all three
  animations on unmount, and `handleExitComplete` bails when the instance is
  gone. `SharedModalInner` is keyed by orientation, so rotating mid-animation
  unmounts it with a Reanimated completion still pending.
- `useTooltipPositioning` cancels its animation frame and guards the
  `measureInWindow` callback with a mounted token.
- `DistanceContent` clears the 1-second pagination timeout on unmount.

Testing these needs either a Reanimated timing harness or a device, neither of
which exists here. The reanimated mock in `jest.setup.js` does not simulate
animation completion callbacks.

To finish: decide whether to build the harness, or verify on device by rotating
the phone during modal open/close and while a tooltip is visible, and by
closing the Distance modal immediately after triggering pagination.

---

## Audit for duplicate/redundant effects

`useTooltipPositioning` had two `useEffect` blocks doing the same measurement.
The second's dependency array was a strict superset of the first's, so the
first could never do anything the second didn't already do — it just measured
twice on mount and on every `showTooltip` change. Now collapsed into one.

That one was only found because a review finding pointed at the file. There is
no way to grep for "two effects that do the same thing", so the rest of the
codebase has not been checked.

To finish: read through the hooks and the larger components looking for
effects whose dependency arrays overlap or subset one another, and for effects
whose bodies are near-identical. Likely places are components that grew by
accretion — `DistanceContent`, `InfoContent`, `FriendProgressContent`,
`useSyncInterval`.

Related, and also unaudited: work that resolves *after* unmount from
un-awaited promises rather than timers. `useLivePedometerDelta` guards this
correctly with a `cancelled` flag; whether every other async handler
re-checks before calling `setState` is unknown. All 14 timer/frame sites were
checked and are clean.


