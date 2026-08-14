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

## Adversarial code review

Do a harsh, "coworker looking for reasons to argue for a raise" pass
over the whole codebase. Priorities: correctness bugs, silent-fail
paths, memory leaks, missed cleanup, race conditions, unhandled edge
cases, footguns in the public API of services, DRY violations
(duplicated logic across files, copy-pasted blocks, parallel
constants that should be shared), tests we don't have but should, and
any place the code is doing something unusual without a comment
explaining why. Deliverable: a categorized list of issues with
severity, file references, and suggested fixes — no code changes,
just a report the maintainers can triage.

---

## Revoke access (pedometer) only revokes one item ✅ done

Turning the source off stops the foreground service, cancels WorkManager
sweeps, and clears the reboot-resume flag. The revoke section lists Physical
activity, Notifications, and stock battery optimization, with an App Settings
action for those OS-managed grants. A separate OEM Battery Settings action is
shown on affected manufacturers for auto-start/background-manager access.
