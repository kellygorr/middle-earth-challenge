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

## App Check token auto-refresh resolves differently per build variant ✅ done

Resolved by source inspection; no device testing was needed and there was no
bug.

`NativeRNFBTurboAppCheck.isAppCheckTokenRefreshEnabled()` runs in the native
module constructor, before any JS. Inside `if (BuildConfig.DEBUG)` it re-reads
`app_check_token_auto_refresh` from `firebase.json` **with a default of
`false`**, so debug logged `false` while release kept the `RNFBMeta` default of
`true`. That log line therefore recorded a pre-JS native default, not the final
state.

JS `initializeAppCheck({ isTokenAutoRefreshEnabled: true })` then calls
`native.setTokenAutoRefreshEnabled(true)`, which overrides it on both variants.
Auto-refresh ends up on either way, so the feared mid-session
`PERMISSION_DENIED` after the 1-hour TTL could not have come from this.

Fixed anyway so the two variants agree from process start and the log stops
being misleading: `firebase.json` now sets

```json
"react-native": { "app_check_token_auto_refresh": true }
```

The key must sit under `react-native` — `firebase-json.gradle` uses
`jsonRoot = 'react-native'` — which also keeps it clear of the Firebase CLI's
own `firestore` block. Verified by regenerating the RNFB BuildConfig:
`FIREBASE_JSON_RAW` now contains the flag.

This closes the brief startup window where debug had refresh off between native
module construction and the JS call.

---

## WorkManager owns the Headless JS sweep ✅ done

The periodic sweep runs on every Android device while a pedometer-backed mode
is active; aggressive OEM battery policies only affect how reliably Android
schedules it and keeps step recording alive.

`PedometerBackgroundWorker` is now a `CoroutineWorker` that starts
`PedometerSweep` directly through React Native's public `ReactHost` and
`HeadlessJsTaskContext` APIs. No secondary Android service is launched from a
background context. The Worker remains active until the JS promise completes,
retries startup/time-out failures instead of falsely returning success, and
skips the sweep when the native recording service is already stopped.

This keeps the single JS commit transaction used by foreground sync and avoids
duplicating watermark, distance, snapshot, and milestone logic in Kotlin.

---

## Detect stopped pedometer recording ✅ done

Resolved after tracing the native data path. A stale commit watermark while
`StepCounterService` is still running means ingestion was delayed, not that
steps were lost: native `step_samples` remain intact and the next foreground
sync catches up automatically. That state is intentionally silent; a comment
marks the branch as a future telemetry hook if telemetry is added later.

When the native recording service is both stopped and stale beyond the normal
commit interval, the app now persists a `pedometerServiceStopped` issue and
restarts the service. Its troubleshooting card explains that samples are
missing after the last commit, provides OEM-specific battery guidance, links
to Sync settings, and offers manual catch-up entry. Multiple concurrent issues
are retained in persistent history and shown in a horizontal carousel.

Focused tests cover the stopped-service card, dynamic units, recovery actions,
carousel sizing and dismissal, plus store-level dismiss, resolve, recurrence,
replacement, and restore semantics.

---

## Transactional database failure recovery ✅ done

Added a stateful in-memory SQLite adapter for tests that models transaction
snapshots and real `BEGIN` / `COMMIT` / `ROLLBACK` effects while exercising the
production `Database` class and progress store.

Coverage now proves that a mid-transaction snapshot failure rolls back entries
and snapshot state without publishing changes to Zustand, failed snapshot
reconciliation leaves memory unchanged, hydration repairs an unversioned or
disagreeing snapshot from persisted entries, and a failed pedometer cursor
write retains neither its entry nor cursor advance. Existing commit tests also
verify that the JS watermark is not published after a rejected database write.

---

## Meaningful app smoke test ✅ done

Jest now provides deterministic global safe-area metrics and the Skia path
measurement primitives used by the map. The app smoke test renders through the
real `MapScreen` and asserts that its Labels control is present instead of
passing on an almost-empty provider tree. `SharedModal` uses the same global
safe-area setup and retains its focused navigation coverage.

The initial map-path reveal also has a tested watchdog: normal completion is
single-shot, but if Reanimated never calls back, the path is forced fully
visible after the expected reveal window and initialization advances. Reset,
unmount, rerender, and already-dismissed onboarding paths are covered.

---

## Verify direct distance writes on device ✅ done

The `pendingEntries` / `pendingDeletions` staging buffer was removed; adding,
editing, and deleting distance now write straight to SQLite through
`applyDistanceEntryChanges`.

The unit tests mock `useProgressStore`, so they prove the right call is made
with the right payload — not that SQLite agrees. Nothing currently exercises the
real database layer.

Verified on the Android device:

- Adding, editing, and deleting update totals immediately and survive process
  restarts.
- Editing retains the same id and updates the row rather than duplicating it.
- Date and time edits persist together.
- Opening Distance from Hobbiton renders the same `DistanceContent` and uses
  the same store/database actions; the modal stack changes only the Back
  destination and does not create a separate write path.

---

## Manual entry validation feedback ✅ done

`MilesFooter` and `EditEntryModal` now share strict input validation. Empty and
zero values remain silent no-ops; malformed, negative, non-finite, fractional
step, and over-limit values receive specific inline feedback. Both distance
and step modes use the same numeric cap of 5,000,000, and the cap itself is
accepted. A reserved caption-2 validation line prevents the controls from
moving when a message appears.

---

## Audit for duplicate/redundant effects ✅ done

`useTooltipPositioning` had two `useEffect` blocks doing the same measurement.
The second's dependency array was a strict superset of the first's, so the
first could never do anything the second didn't already do — it just measured
twice on mount and on every `showTooltip` change. Now collapsed into one.

The remaining hooks and larger components were audited, including
`DistanceContent`, `InfoContent`, `FriendProgressContent`, `MapScreen`,
`SharedModal`, `useSyncInterval`, and `useLivePedometerDelta`. No further
overlapping effects or unsafe post-unmount React state updates were found.

`useFriendProgressSync` deliberately has separate interval and AppState
effects: the interval does not tick immediately on foreground resume, while
the AppState listener does. A timer and foreground event can coincide, but
`friendProgressWorkflow.synchronize` deduplicates concurrent calls through its
shared in-flight promise.

---

## Restrict Node types to tests ✅ done

`tsconfig.json` now excludes tests and exposes only Jest types, so React Native
app code can no longer typecheck imports from Node built-ins. The separate
`tsconfig.test.json` includes test files and adds Node types for cross-layer
parity checks that read repository files. `npm run typecheck` validates both
compiler programs.

---

## Verify Worker-owned pedometer sweep on device ✅ done

The Worker-to-Headless-JS refactor compiles and its shared JS commit path is
covered by unit tests, but the Android scheduler/runtime boundary needs device
validation before release.

Verified on a Pixel 6 debug build with Metro available:

- WorkManager registered `middleearth.pedometer.background.sweep` and the
  native step service was running.
- A forced idle-window run advanced `last_sync_timestamp` without creating a
  zero-step row.
- A forced run after walking 34 steps created exactly one pedometer row,
  advanced the watermark, remained `RUNNING` while Headless JS persisted the
  result, and returned to WorkManager's `ENQUEUED` periodic state.

Stopped-service and retry branches remain covered by focused tests. A longer
untethered battery soak can still be performed as release QA on an aggressive
OEM device, but it is not required to establish that WorkManager owns and
awaits the Headless JS sweep correctly.

---

## Verify native step-sample pruning ✅ done

Raw samples now retain a 48-hour recovery margin for delayed WorkManager runs
and transient commit failures. A Robolectric test exercises the real
`StepCounterDbHelper` against an isolated temporary SQLite database seeded with
multiple faux boot histories. It verifies that pruning deletes redundant old
samples, keeps the newest pre-cutoff anchor for every `boot_id`, preserves all
newer samples, and still computes the correct step delta across the cutoff.
The installed app database is not involved.

---

## Verify unmount/rotation cleanup on device ✅ done

Batch 5 added cleanup for deferred UI work, none of it covered by tests:

- `useAnimatedModal` cancels the queued entrance frame and all three
  animations on unmount, and `handleExitComplete` bails when the instance is
  gone. `SharedModalInner` is keyed by orientation, so rotating mid-animation
  unmounts it with a Reanimated completion still pending.
- `useTooltipPositioning` cancels its animation frame and guards the
  `measureInWindow` callback with a mounted token.
- `DistanceContent` clears the 1-second pagination timeout on unmount.

Modal open/close rotation and tooltip rotation were verified without crashes,
stale overlays, or React Native errors. The tooltip remained correctly
positioned after rotation. Distance pagination was triggered with render-only
synthetic history, then the modal was closed while its one-second timer was
pending; the app remained responsive and logged no deferred update or lifecycle
errors. The synthetic entries were never persisted and were removed afterward.

---

## Add labels to icon-only controls ✅ done

Every interactive `IconButton` call site now has a concise action-oriented
accessible name; the sole unnamed instance has no press handler and renders as
a decorative view. Focused component tests cover the Map, shared-modal, and
entry-editor controls. On the Pixel 6, Android's accessibility hierarchy exposes
View statistics, Open settings, Recenter map, and Add distance as named buttons
for TalkBack and UI automation.

---

## Highlight step-count updates ✅ done

When the live total changes after the Map screen mounts, only the numeric part
of the steps chip fades to the `uiStepIncrease` pale gold (`#e9df7f`) for 200
ms, holds for 600 ms, then fades back for 200 ms. The `steps` label retains its
normal color, initial hydration does not trigger the cue, and another update
restarts the one-second window so the latest change remains visible.

---

## Tokenize semantic UI colors ✅ done

Badge states use dedicated `uiBadge*` tokens, warning indicators share
`uiWarning`, splash/error UI uses `splash*`, and icon foregrounds resolve from
button or `iconInverted` theme tokens instead of asset-level black/white
defaults. The transient step increase uses `uiStepIncrease`. Structural map,
shadow, transparency, and celebration-palette literals remain local by design.

---

## Android backup, migration recovery, and friend identity

- [x] **Enable Android backup — decided against, staying with manual export/import.**
      OS-level Auto Backup restores the raw SQLite file on a fresh install before
      the user ever opens the app, with no chance to validate or confirm
      anything. That would require automatic first-launch reconciliation of
      stale sharing UIDs, mid-flight provisioning/deletion flags, and
      device-specific health-sync cursors — a much riskier, silent version of
      the reconciliation the manual export/import flow already does
      deliberately with user confirmation. `android:allowBackup="false"` stays
      as-is; the manual flow fully covers cross-device transfer.
- [x] **Define backup exclusions — not needed.** Only relevant if Android
      Auto Backup were enabled (see above); moot now that it isn't.
- [x] **Create one reusable pre-migration snapshot.** `database.ts` now
      tracks a `schema_meta.version` row and `CURRENT_SCHEMA_VERSION` constant.
      On an upgrading install whose stored version is behind the current one,
      `createPreMigrationSnapshot()` uses SQLite's `VACUUM INTO` (via
      `@op-engineering/op-sqlite`) to copy the live database to one fixed
      snapshot file (`MiddleEarthSettings.premigration.db`), overwriting any
      prior snapshot. If the subsequent migration throws, `restoreFromPreMigrationSnapshot()`
      attaches the snapshot and rebuilds every live table from its own schema
      and data (not a column patch — a migration can fail after adding only
      some columns, so the live schema at that point can't be trusted), then
      migrations retry once. A fresh install (no prior recorded version) never
      snapshots, since there's nothing yet to protect. Covered by
      `needsPreMigrationSnapshot`, `pre-migration snapshot and restore`, and
      `migrateWithSnapshotProtection` test suites in `database.test.ts`.
- [x] **Friend-sharing identity behavior decided and implemented.** On the
      same phone, stopping/deleting sharing and enabling it again creates a new
      Firebase anonymous UID. Exporting no longer disconnects friend sharing —
      the connection stays active on the exporting phone. Importing on a fresh
      phone (no existing sharing) migrates the exported profile and cleans up
      the stale participant under the old UID; importing onto a phone that
      already has sharing configured preserves the destination's sharing state
      and only deletes the stale exported participant.
- [x] **Decided: an old phone rejoining sharing after migration is treated
      as an independent participant, by design.** Since export no longer
      disables sharing, an old phone can still be actively sharing when its
      backup is imported and migrated on a new phone. The new phone's cleanup
      deletes the old phone's Firestore row, but never touches the old phone's
      own Firebase Auth session or local settings — if that phone keeps
      running, it silently recreates its own row under its own unchanged UID
      the next time its distance changes (`setParticipant` uses `setDoc`,
      create-or-replace, not `updateDoc`, so there's no "document not found"
      failure). This is intentional: migrating away from a device doesn't
      revoke its ability to keep sharing under its own identity if the user
      goes back to it — two devices become two independent participants, not a
      broken or merged identity. The only user-visible effect is a brief gap on
      friends' leaderboards until the old phone republishes. See the comments
      on `deleteFriendProgressByUserId` and `setParticipant` in
      `friendProgressService.ts`.
- [x] **Firestore delete rule is broader than the migration scenario
      requires — fixed.** `allow delete: if request.auth != null` on
      `friend_progress`/`friend_progress_debug` let any authenticated user
      (including any throwaway anonymous session) delete any other user's
      row at any time, not just a stale migrated one. Replaced with
      `isOwner(userId) || canDeleteStaleParticipant(resource.data)`: the
      owner can always delete their own row, and a non-owner can delete
      only once `resource.data.updatedAt` is more than 15 minutes old —
      comfortably above the ~2-minute publish cadence
      (`docs/shared-progress.md`), so a genuinely active participant's row
      is never eligible for non-owner deletion. This still supports
      `deleteFriendProgressByUserId`'s post-import cleanup: that call has
      no retry logic of its own, but needs none, because a denied delete
      throws, `sharingMigrationSourceUserId` is deliberately left set
      (`friendProgressWorkflow.ts`), and the next ~2-minute sync cycle
      retries automatically until the source row actually goes stale.
      `firestore-tests/rules.test.ts` now covers both directions: a stale
      cross-UID row can still be deleted (migration cleanup keeps
      working), and a fresh cross-UID row cannot (the griefing vector is
      closed). All 18 rules-emulator tests pass.
- [x] **Firestore rules test for cross-UID delete.** `friend_progress`/
      `friend_progress_debug` delete rules changed from owner-only to any
      authenticated user, so a destination phone can delete a stale participant
      row left by a migrated import. Added an emulator-backed rules test suite
      (`firestore-tests/rules.test.ts`, `yarn test:rules`) covering owner writes,
      cross-user write/read rejection, and both same-owner and cross-UID delete
      scenarios (requires a local Java 21 JDK for the Firestore emulator).

---

## Failure resilience review

A new review guide, `docs/failure-resilience-review.md`, was written to focus
specifically on "if a step fails or hangs, does the app stay usable?" — a
different lens than the two general-correctness adversarial reviews. Findings:

- [x] **Bootstrap could hang indefinitely on a cold-starting Health Connect
      provider, with no timeout and no way for the user to retry.** Neither
      `runRecoverableBootstrapStep` nor `runRequiredBootstrapStep` (App.tsx)
      bound how long an awaited step can take — only rejections were handled,
      not hangs. The likely real culprit for the previously-unexplained
      minute-long update-launch stall: `ensureTrackingModeRunning` (dual
      tracking mode) awaits `fitnessService.getHealthConnectPermissionState()`,
      which makes real binder calls into the separately-updating Health
      Connect provider app — exactly the kind of call that can stall well
      past normal expectations right after an OS/provider update.
      Fixed narrowly: added a shared `withTimeout()` utility
      (`src/utils/withTimeout.ts`, also now used by the existing
      `healthChunkRead.ts` chunk-timeout logic instead of a duplicate local
      copy) and wrapped only the Health Connect module load +
      `initialize()` + `getGrantedPermissions()` sequence inside
      `getHealthConnectPermissionState()` — not the outer
      `ensureTrackingModeRunning()` state machine. This distinction matters:
      that inner call is a pure read with no side effects, and on timeout it
      returns `'unknown'`, the exact same safe fallback its own catch block
      already returns for any other failure — so `'unknown'` flows through
      every existing caller exactly as a transient error already does today,
      with no new states to reason about. Explicitly rejected wrapping the
      whole `ensureTrackingModeRunning()` call instead: that function mutates
      settings/tracking mode *after* the awaited call, so a timeout there
      wouldn't cancel the abandoned continuation — it could still fire later,
      after bootstrap moved on, and land a stale mutation while the user is
      already on the map screen. New constant:
      `HEALTH_CONNECT_PERMISSION_CHECK_TIMEOUT_MS` (5s) in `constants/sync.ts`.
      Covered by a new `src/utils/__tests__/withTimeout.test.ts` suite (no
      existing harness mocks `react-native-health-connect`/`Platform.OS` in
      this codebase, so the timeout mechanism itself is tested directly
      rather than adding new native-module mocking infrastructure for one
      call site).
- [x] **Friend-sharing sync/delete can permanently wedge for the rest of the
      app session if a Firestore call hangs** (e.g. `waitForPendingWrites`
      never resolving while offline). `synchronize()`/`finishDeletion()` in
      `friendProgressWorkflow.ts` share one in-flight promise across all
      callers and only clear it in `.finally()` — which never runs if the
      underlying call never settles. Every subsequent periodic sync tick and
      every manual "Retry" tap just re-awaits the same permanently-pending
      promise for the rest of the session, with no way for the user to tell
      "still working" from "frozen." Fixed by wrapping every network-bound
      `client.*` call in `friendProgressService.ts` with the same
      `withTimeout()` utility from Cluster 1
      (`FRIEND_PROGRESS_NETWORK_TIMEOUT_MS`, 15s — comfortably under
      `FRIEND_PROGRESS_SYNC_INTERVAL_MS`'s 2-minute tick so a timed-out
      attempt clears before the next one). Each wrap sits at the exact await
      point inside the function that owns any statements after it (never
      wrapping a whole function from outside), so a timeout only ever skips
      that function's remaining statements — e.g. in `deleteFriendProgress`,
      a timed-out `flushPendingWrites()` means `signOut()` is never reached
      on that attempt, so the still-signed-in session and locally-queued
      delete are both intact for the next retry to pick up cleanly. The
      workflow layer's existing `.finally()` guard-clearing already handles
      any rejection generically (proven by existing tests), so converting a
      hang into a timeout-rejection at the service layer was the whole fix —
      no workflow-layer changes needed. New tests in
      `friendProgressService.test.ts`'s `'network timeout'` suite prove the
      timeout fires, `signOut`/downstream calls are skipped, and — the
      critical end-to-end proof — a second attempt after a timed-out delete
      succeeds normally.
- [x] **`useLivePedometerDelta`'s in-flight guard isn't reset on effect
      teardown**, so a hung native pedometer read could freeze the live step
      display even across a tracking-mode switch. Lower likelihood than the
      above (the underlying native calls are synchronous local reads), but a
      real gap: `inFlightRef` is only cleared in `refresh()`'s own `finally`
      block, not in the effect's cleanup function. Fixed by resetting
      `inFlightRef.current = null` in the cleanup alongside the existing
      generation bump — the existing `generation === generationRef.current`
      check already protects against a late-resolving stale request writing
      a stale value, so this fix purely unblocks the guard for the new
      effect instance. A side benefit: the new effect's own first
      `refresh()` now starts immediately on mount rather than potentially
      waiting on a stale request to happen to resolve first; updated an
      existing test (`discards an in-flight result after the watermark
      changes`) whose assertions had baked in the old, blocked-guard timing,
      and added a dedicated regression test using a request that never
      resolves at all (not just late) to prove the guard no longer sticks.

---

## Add more trivia

- [x] **Mile 308 — Ford the River?** An Oregon Trail Easter egg at the Last
      Bridge, with `oregon-trail.jpg` artwork.
- [x] **Mile 492 — The Pass of Caradhras.** The Fellowship's failed mountain
      crossing, with `caradhras.jpg` artwork.
- [x] **Reviewed the remaining long gaps between Rivendell/Lothlorien and
      Lothlorien/Parth Galen.** Rivendell → Lothlorien is resolved: `The
      Pass of Caradhras` (492), `Hollin Gate` (531), and `The Bridge of
      Khazad-dûm` (551) now space that segment at 72/39/20-mile intervals.
      Lothlorien → Parth Galen keeps its two existing entries, `Lembas
      Bread` (700) and `The Argonath` (850) — **decided to leave as-is**:
      that segment is the Fellowship's river journey down the Anduin by
      boat, which doesn't have enough distinct route-appropriate lore
      beats to justify forcing additional trivia into the gap.

---

## Device-testing findings on 1.1.4 candidate (2026-10-22)

Found during a fresh-install smoke test of `com.middleearthchallenge.debug`
on a physical Pixel 6, independent of the pending legacy-migration
rehearsal. Both reproduced on-device.

- [x] **Yellow (active) journey path animated jagged/choppy; grey (base
      reveal) path stayed smooth — fixed.** Reproduced both on the
      production app's default/original map pan position and on the debug
      app's differently panned/zoomed starting position — not specific to
      one map location. Confirmed only during the animation itself (not a
      static geometry defect): jaggedness stopped the instant the
      animation finished.
  - Two earlier fix attempts on this same investigation did **not**
    resolve it and are documented here so the real cause isn't
    re-litigated: (1) flattening `gameProgressAdjusted`'s read of
    `basePathEnd.value` (a derived value) to read
    `initialBasePathProgress?.value` (the raw shared value) directly,
    suspecting a derived-on-derived staleness hazard; (2) moving
    `useGameProgressAnimation`'s JS-sync throttle gate from inside the
    `runOnJS`-scheduled function to before scheduling `runOnJS` at all, so
    the cross-thread dispatch itself — not just the resulting state write
    — only happens ~10/sec instead of on every frame. Both were reasoned
    from the code and shipped for on-device testing; neither changed the
    reported behavior.
  - **Actual root cause:** `MiddleEarthMapSkia` (the `<Canvas>` component)
    was not memoized, so every ~10Hz `animatedProgress` JS state update
    from `useGameProgressAnimation` — which exists specifically to drive
    `PointLayer`'s checkpoint/trivia activation logic, not anything
    visual in the Skia canvas itself — triggered a full React re-render of
    the entire Canvas subtree. Per a documented upstream
    `react-native-skia` issue (#4243), every Canvas commit re-records its
    scene graph on the JS thread (twice), which is expensive and competes
    with the UI thread for the same frame budget the stroke-trim
    animation needs. The grey/base path reveal never triggers any JS
    state change at all, so it never hit this path — matching why it
    stayed smooth while the yellow path, the only one paired with a
    recurring unrelated re-render of its own renderer, did not.
  - **Fix:** wrapped `MiddleEarthMapSkia`'s export in `React.memo`
    (`src/components/MiddleEarthMapSkia.tsx`) so it only re-renders when
    its own props actually change — every value that needs frame-accurate
    animation (`gameProgress`, `initialBasePathProgress`, `zoomScale`,
    `shimmerProgress`) is already a shared value read directly by
    Reanimated/Skia on the UI thread, independent of React re-renders.
    This required also fixing `MapScreen.tsx`'s `layerColors` prop, which
    was an inline object literal recreated on every render — left as-is,
    it would have defeated the new memo via React's default shallow prop
    comparison just as completely as not memoizing at all. Replaced with
    a `useMemo`'d `mapLayerColors` keyed on the actual theme color values.
  - Verified on-device: the active path now animates smoothly, matching
    the grey path.
- [x] **Returning to the app leaves MapScreen mounted but visually blank
      (no UI rendered), though touch targets still work — fixed.** Reported
      sequence: open Recents, swipe the app card away to fully dismiss it
      (a plain Home-button background/foreground cycle never reproduced
      this), then reopen the app from the launcher. MapScreen returned to
      the same screen with path/buttons invisible but still tappable
      (blind-tapping the Settings button's location still opened Settings),
      and opening/closing any modal (e.g. Settings → Home) "re-triggered"
      correct rendering. No crash, no error dialog.
  - Several earlier theories and fix attempts did **not** resolve it and
    are documented here so they aren't re-litigated: (1) a GPU/Skia
    surface-loss theory, addressed by force-remounting the Skia canvas via
    a `key` bump on every `background→active` `AppState` transition — this
    visibly "flashed" the canvas on every resume (too aggressive) and was
    fully reverted per explicit user direction; (2) a theory that
    Reanimated's animation driver wasn't re-applying computed values to
    newly recreated native views after the OS recreates the Activity —
    addressed by building a whole `useResumeEpoch()` module-scope-state
    detection hook plus "replay the entrance animation on resume" logic
    wired into both `useInitialAnimation.ts` and
    `useGameProgressAnimation.ts`. This was iterated on extensively (fixing
    several real bugs in the epoch-consumption timing along the way) and
    on-device debug logging eventually proved the animation commands
    *were* genuinely firing on resume — yet the UI still stayed blank,
    disproving the native-reconnection theory entirely. All of this
    machinery (the hook, its test, and both hooks' wiring) was fully
    removed once the real cause was found; it was never the fix.
  - **Actual root cause**, confirmed via on-device logcat correlation of
    `[App] initApp` bootstrap logs against `phase`/`showWelcome` state:
    swiping the app away in Recents does not kill the process (same PID
    throughout), but it does cause Android to fully recreate the Activity,
    which recreates the entire React root (confirmed via a fresh
    `Running "MiddleEarthChallenge"` log line with an incremented
    `rootTag` on every such resume) and reruns `App.tsx`'s bootstrap effect
    (`initApp()`) from scratch — while Zustand/module-scope store state
    (including `initializationStore` and `settingsStore`) survives
    untouched across that recreation. `initApp()` unconditionally called
    `setPhase('ready')` on completion — `'ready'` is documented as
    "welcome screen visible," and the *only* code path that ever promotes
    `phase` onward (`'revealing'` → `'active'`) is `WelcomeModal`'s
    `onDismiss` handler, which only ever fires while `showWelcome` is
    `true`. For any returning user, `showWelcome` is already persisted
    `false` from completing onboarding in a prior session, so
    `WelcomeModal` never mounts again and `onDismiss` never fires again —
    meaning every post-resume bootstrap rerun left `phase` **permanently
    stuck at `'ready'` forever**, with no remaining code path able to ever
    advance it. `useInitialAnimation.ts`'s `showWelcome`-gated hide-branch
    (effectively `phase !== 'active'`) ran on every subsequent render,
    forever resetting path/button opacity to 0, while its reveal branch
    never ran again — exactly matching the symptom (permanently invisible
    UI, only after swipe-away-resume, never after a plain backgrounding
    cycle that doesn't rerun this effect at all).
  - **Fix** (`App.tsx`): read `initializationStore`'s `phase` directly at
    the top of `initApp()`, before touching anything, to capture whether
    the app was already `'active'` (fully onboarded and running) before
    this bootstrap rerun started. If so, skip `setPhase('loading')`
    entirely (a warm resume has nothing to visually reload) and, on
    completion, skip `setPhase('ready')` too, since there is nothing to
    restore. If bootstrap was *not* already active (genuine first launch,
    or recovering from an error), it still correctly lands on `'ready'`
    for first-time users (`showWelcome` true, so Welcome can still show
    and its `onDismiss` can still promote the phase normally) or directly
    on `'active'` for already-onboarded users (skipping the dead-end
    `'ready'` plateau entirely, since there's no Welcome left to dismiss).
    Added two regression tests in `__tests__/App.test.tsx` reproducing
    both the original permanently-stuck scenario (mounting against a
    pre-set `phase: 'active'` store + already-onboarded settings) and the
    first-time-user path (confirming it's unaffected, still correctly
    gated on `'ready'`).
  - **Follow-up regression caught during verification**: the initial
    version of this fix (skipping only the *final* `setPhase('ready')`,
    not also the *initial* `setPhase('loading')`) still forced
    `phase: 'loading'` momentarily on every warm resume, which
    `startupShowWelcome` treats as "hide the UI" — producing a brief but
    real hide-then-reveal flash on every plain background/foreground
    cycle (confirmed via on-device logging: `phase` dipped to `'loading'`
    then recovered to `'active'` a few hundred ms later, with zero actual
    bootstrap work needed in between). Fixed by also skipping the initial
    `setPhase('loading')` call when the app was already active — a warm
    resume now never touches `phase` at all, which also finally proved
    the `useResumeEpoch` replay mechanism above was unnecessary dead
    weight (it only existed to paper over symptoms of this same
    `phase`-churn bug) and let it be fully removed.
  - **Confirmed fixed on-device** across both the original repro (swipe
    away in Recents → reopen) and the newly-found flash regression (plain
    background → foreground), with 439 tests passing before cleanup and
    435 passing after removing the no-longer-needed `useResumeEpoch`
    mechanism (48 suites → 47 suites, 4 fewer tests from the deleted
    hook's own test file).
- [x] Both findings now have a confirmed root cause and fix; this build is
      no longer blocked on resume/animation behavior before being treated
      as release-ready, clearing the way for the `1.1.3` migration
      rehearsal (`docs/android-manual-testing.md`).

### Manual entry future-dating could silently double-count distance/steps

- [x] **The Distance screen's edit-entry date stepper allowed setting a
      future date with no upper bound — fixed.** Found while reviewing
      device-testing behavior, not from a user report. The "Next day"
      chevron in `EditEntryModal` (via `DateStepper`) had no clamp at all,
      so a manual entry could be dated arbitrarily far into the future.
  - **Confirmed impact if left unfixed:** this was not an overwrite risk —
    it was a silent double-count risk. A manual entry's id is
    `manual_<creationTimestamp>` (unrelated to its `date` field), while
    automatic entries use day-keyed ids (`hc_aggregate_<dayStartMs>` for
    Health Connect, `pedo_<segmentStartMs>` for pedometer). The upsert
    path (`applyDistanceEntryChanges`) only replaces a row when its `id`
    matches exactly, and every total (Map/Stats) is a flat
    `SUM(miles)`/`SUM(steps)` with no per-day dedup anywhere in the sync
    or reconciliation code. So once a future-dated manual entry's real
    calendar day arrived and Health Connect/pedometer data synced in for
    that day, both rows would persist and both would be counted —
    silently inflating that day's (and the running total's) distance and
    steps rather than either value being overwritten.
  - **Fix** (`src/components/Modals/DateStepper.tsx`): added a `maxDate`
    prop (defaults to `Date.now()`) and compare by calendar day (via the
    existing `getStartOfDay` helper), not exact timestamp — a raw
    timestamp comparison would incorrectly block stepping to today itself
    once the current time-of-day had already passed the entry's stored
    time. The "Next day" button is disabled once the date reaches the max
    day, and its handler also no-ops defensively even if pressed. The
    "Previous day" button and the separate `TimeInput` time-of-day field
    were deliberately left untouched per explicit direction — constraining
    time-of-day input risks making it harder to type while editing.
  - Added `src/components/Modals/__tests__/DateStepper.test.tsx` (5 tests,
    previously no dedicated test file existed): steps back/forward
    normally, disables "Next day" and ignores a forced press at the max
    day, still allows stepping backward from the max day, compares by
    calendar day rather than timestamp (the exact edge case above), and
    confirms the `maxDate` default. Confirmed fixed on-device.
