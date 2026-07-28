# TODO

Ongoing list of deferred work items outside a specific release scope.

---

## Modal size

Modals currently have inconsistent widths / heights across screens. Audit
and standardize:

- Pick a canonical modal size (or two — e.g. `regular` vs `wide`).
- Update every `pushModal({type: ...})` consumer to use the standard.
- Consider a `size?: 'regular' | 'wide'` prop on the modal container so
  screens with wider content (Distance list, Data screen) opt in
  explicitly rather than each modal setting its own dimensions.

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

## Add step counts to Stats screen

Now that every `DistanceEntry` carries a `steps` field, surface it in
the stats modal alongside distance figures:

- Total steps (cumulative)
- Average steps / day
- Best day (max steps in a single day)
- Any other derived stats already computed for miles, mirrored for
  steps
- Only show for pedometer users? Or show for all users since the
  step column is populated (measured or derived) for every entry?
  Decide based on how honest the derived-from-manual numbers feel.

Touch points: `src/stores/statsStore.ts` (extend `Stats` type and the
`getStats` reducer) and `src/components/Modals/Content/StatsContent.tsx`
(render the new rows).

---

## Consider adding steps to checkpoints & trivia

Checkpoints and trivia unlocks are currently gated on cumulative miles.
Now that steps are tracked alongside miles, evaluate whether some
milestones should be step-based instead:

- Would a "10,000 steps in a day" or "1,000,000 total steps" unlock
  feel more motivating than a mile-based one?
- Does adding a step-flavored gate improve pedometer users' engagement
  without breaking parity with health-app users? (Health-app users
  still have `steps` populated — measured for HC-steps, derived from
  miles otherwise — so the game rule stays sensible for both.)
- Impact: `src/constants/checkpoints.json`, `src/constants/trivia.json`,
  and whatever gating logic reads those (`useProgressStore` selectors
  or a helper). Any per-user copy that says "walk X miles" would need
  step-friendly alternatives.

Purely exploratory — no design decision has been made yet.

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

## Revoke access (pedometer) only revokes one item

The "Revoke access" flow for the pedometer source currently gives
directions for revoking **one** of the required grants (physical
activity, notifications, and the battery-optimization allowlist entry).
The other two aren't addressed, so the user is left thinking they've
fully revoked when they haven't.

Fix: either walk the user through all three (deep-link each Settings
screen sequentially) or, better, revoke what we can programmatically
(stop the FGS, cancel WorkManager sweeps, clear the "was tracking"
flag) and then surface a single Settings-panel deep-link for the
runtime permissions the OS won't let us clear ourselves. Copy should
be explicit about which grants Android forces the user to revoke by
hand.

