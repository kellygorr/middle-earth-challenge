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
