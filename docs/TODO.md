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

## Add more trivia

- [x] **Mile 308 — Ford the River?** An Oregon Trail Easter egg at the Last
      Bridge, with `oregon-trail.jpg` artwork.
- [x] **Mile 492 — The Pass of Caradhras.** The Fellowship's failed mountain
      crossing, with `caradhras.jpg` artwork.
- [ ] Review the remaining long gaps between Rivendell/Lothlorien and
      Lothlorien/Parth Galen for additional route-appropriate trivia.
