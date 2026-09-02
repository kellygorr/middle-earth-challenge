# Android Manual Release Testing

Use this checklist before publishing an Android build. It covers physical-device
behavior that automated tests cannot establish, plus a regression sweep of the
app's main workflows.

This document is Android-only. Run the critical path for every candidate. Run
the full regression after broad changes or before a public release.

## Test record

| Field                    | Value                 |
| ------------------------ | --------------------- |
| Tester                   |                       |
| Date                     |                       |
| Git commit               |                       |
| Version name / code      |                       |
| Build type               | Debug / Release       |
| APK or distribution link |                       |
| Device                   |                       |
| Android version          |                       |
| Health Connect version   |                       |
| Result                   | Pass / Fail / Blocked |

For every failure, record the section, steps, expected and actual behavior,
screenshots or video, and relevant logs.

## Safety and test strategy

- [ ] Use a device and account whose health and sharing data may be changed.
- [ ] Record existing miles, steps, source mode, and entry count before testing.
- [ ] Treat uninstall, Clear storage, source-data deletion, and clock changes as
      destructive. Run them only when the section explicitly calls for them.
- [ ] Test the Debug build first for fast iteration.
- [ ] Repeat the critical path on the exact signed Release APK to be published.
- [ ] Do not run Metro while validating the Release APK. A release build must
      start and operate from its bundled JavaScript and assets.

## Automated pre-flight

- [ ] `npm install` completes with no unexpected dependency changes.
- [ ] `npm test -- --runInBand` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npx prettier --check .` passes.
- [ ] `cd android && ./gradlew testDebugUnitTest` passes.
- [ ] `git diff --check` passes.
- [ ] Review `git status`; every included file is intentional.
- [ ] Confirm `package.json` version matches Android `versionName`.
- [ ] Confirm Android `versionCode` is greater than the last published build.
- [ ] Review `docs/TODO.md` for release blockers.

## Build and install

### Debug candidate

- [ ] Start Metro with `npm start`.
- [ ] Connect the phone and run `adb reverse tcp:8081 tcp:8081` when using USB
      or wireless ADB.
- [ ] Install or launch the Debug app (`com.middleearthchallenge.debug`).
- [ ] Confirm there is no red error screen and the Metro bundle completes.

### Release candidate

- [ ] Build with `cd android && ./gradlew assembleRelease`.
- [ ] Confirm `android/app/build/outputs/apk/release/middle-earth-challenge.apk`
      exists and has a current timestamp.
- [ ] Install the signed APK using the same path users will use.
- [ ] Confirm the package is `com.middleearthchallenge`, not the Debug package.
- [ ] With Metro stopped, cold-launch the app and confirm all screens, fonts,
      icons, maps, checkpoint images, and trivia images load.
- [ ] Force-stop and relaunch the Release app; confirm progress persists.

## Critical release path

Complete this section on the signed Release APK.

- [ ] Cold launch succeeds without a crash, blank screen, or development error.
- [ ] Welcome opens and the primary action is visible and reachable.
- [ ] Dismiss Welcome; the map, controls, and path render correctly.
- [ ] Add a manual distance entry; totals update immediately.
- [ ] Force-stop and reopen; the entry and totals persist.
- [ ] Edit the entry; totals update without creating a duplicate.
- [ ] Delete the entry; totals update immediately and remain correct after restart.
- [ ] Open Settings and activate the intended tracking source(s).
- [ ] Complete one real source sync and confirm the resulting Distance row.
- [ ] Complete the mandatory `1.1.3` legacy conversion rehearsal below.
- [ ] Background and foreground the app; no crash, frozen overlay, or stale total.
- [ ] Rotate portrait to landscape and back on Map, Settings, Distance, and an
      open info modal; controls remain reachable.
- [ ] Confirm no unresolved error banner or unexpected warning remains.

## Install and upgrade paths

### Existing-user upgrade

- [ ] Before installing the candidate over an existing version, record totals,
      entries, tracking sources, units, theme, and friend-sharing state.
- [ ] Install the candidate without uninstalling or clearing storage.
- [ ] Existing miles, steps, entries, settings, and source selections remain.
- [ ] Historical entries show the correct source and completed status.
- [ ] Stats agree with the Distance list and map totals.
- [ ] A new entry or sync succeeds after migration.
- [ ] Force-stop and reopen; migrated state remains stable.

### Mandatory legacy `1.1.3` conversion rehearsal

This is a release gate for the first build that migrates the distributed Android
`1.1.3` database. Do not substitute a fresh install or Debug-to-Release install:
Android must upgrade the production package in place with the same signing key.

The shipped `1.1.3` database already stores miles and steps on each entry. The
candidate must preserve those authoritative rows, rebuild the versioned progress
snapshot from them, add new settings with safe defaults, and complete one final
raw-ID Health Connect sync before switching to the new aggregate-ID format.

#### Prepare a representative `1.1.3` installation

- [ ] Remove only the Debug package if it could cause confusion. Do not clear or
      uninstall the production package after creating the legacy fixture.
- [ ] Install the exact last distributed `1.1.3` APK through App Tester or the
      archived release artifact.
- [ ] Confirm Android reports version `1.1.3` and production package
      `com.middleearthchallenge`.
- [ ] Create or retain representative persisted data:
  - [ ] At least two manual entries on different dates.
  - [ ] At least one Health Connect entry when Health Connect is used.
  - [ ] At least one pedometer entry when pedometer is used.
  - [ ] At least one legacy `synced` row if an existing real user fixture has one;
        do not fabricate it through unsupported production database editing.
- [ ] Choose non-default settings that are easy to recognize after upgrade:
      theme, miles/kilometers, label visibility, map color, and text/label size.
- [ ] Leave the real intended tracking source active.
- [ ] In `1.1.3`, capture screenshots of Map, Stats, Distance, and Sync settings.
- [ ] Record every visible row's date, distance, steps, and source label.
- [ ] Record the Map/Stats total miles and steps and the number of Distance rows.
- [ ] Sum the persisted Distance rows. Use this row sum as the authoritative
      expected total if it differs from a cached headline in `1.1.3`.
- [ ] Force-stop `1.1.3` so no write is in progress before installing the candidate.

#### Rehearsal A: clean offline-first conversion

- [ ] Enable Airplane mode before installing and first-launching the candidate.
      This separates local database migration from Health Connect cutover.
- [ ] Install the signed Release candidate directly over `1.1.3` without
      uninstalling or clearing storage.
- [ ] Android accepts it as an update. Any signature, package, or downgrade error
      is a release blocker.
- [ ] Cold-launch the candidate while offline.
- [ ] Startup completes without a blank screen, bootstrap error, crash, or ANR.
- [ ] Map and Stats totals equal the sum of the persisted legacy entries.
- [ ] Total steps equal the sum of stored entry steps; miles are not changed by a
      derived-step backfill.
- [ ] Distance contains every recorded legacy row exactly once with the same date,
      distance, steps, and truthful source classification.
- [ ] Manual, Health Connect, pedometer, and legacy synced rows remain in their
      correct data-management category and can be found after paging.
- [ ] Theme, units, labels, map appearance, text size, tracking source, and sync
      bookmarks retain their prior values.
- [ ] Dual mode is not selected automatically for an existing single-source user.
- [ ] Friend sharing remains off and no sharing profile or cloud publication is
      created automatically.
- [ ] Force-stop and cold-launch again while still offline.
- [ ] The second startup succeeds with identical totals and rows. No migration is
      repeated visibly and no duplicate entry appears.
- [ ] Disable Airplane mode and wait for Health Connect to become available.
- [ ] Trigger Sync Now and allow the first post-upgrade sync to finish completely.
- [ ] Existing Health Connect records are not duplicated when the compatibility
      sync reads their legacy raw IDs.
- [ ] Only genuinely new Health Connect data changes totals or row count.
- [ ] Trigger Sync Now a second time without adding source data; totals, row count,
      and row identities remain unchanged.
- [ ] Force-stop and reopen; converted totals, rows, settings, and source state
      remain stable.

#### Rehearsal B: interrupted Health Connect cutover

Repeat from a newly prepared `1.1.3` fixture. Reinstalling the candidate over an
already converted database does not exercise this path.

- [ ] Prepare `1.1.3` again with Health Connect enabled, multiple historical days,
      and recorded before-state evidence.
- [ ] Install the signed Release candidate over it without clearing storage.
- [ ] Launch online and start the first post-upgrade Health Connect sync.
- [ ] While a multi-part sync is visibly in progress, force-stop the app once.
      Do not clear storage or revoke Health Connect.
- [ ] Reopen the candidate and let recovery/resumed sync finish.
- [ ] The app starts normally and does not remain in a permanent loading or syncing
      state.
- [ ] Completed legacy chunks are not duplicated.
- [ ] Unfinished chunks resume through the compatible raw-ID path and eventually
      complete.
- [ ] Totals equal the legacy row sum plus only confirmed new source data.
- [ ] Every legacy row remains present once, with its original source and date.
- [ ] Run Sync Now again with no new source data; totals and row count do not change.
- [ ] Force-stop and reopen twice; both launches produce the same stable result.

#### Optional Debug database evidence

This supplements but does not replace the signed Release upgrade. Use a separate
Debug fixture and Android Studio's App Inspection > Database Inspector to inspect
`MiddleEarthSettings.db` before and after conversion.

- [ ] Run `npm run fixtures:legacy`. It generates and validates disposable
      databases under `.migration-fixtures/android-1.1.3/`; generated files are
      ignored by Git.
- [ ] Open `manifest.json` and record the expected row, mile, step, and source
      totals before installing a fixture.
- [ ] Exercise each independent source profile: `manual-only`, `health-only`,
      `health-manual`, `pedometer-only`, `pedometer-manual`, and
      `health-pedometer`.
- [ ] Exercise `source-switching-stress` separately. It alternates Health Connect
      and pedometer several times every day and includes manual distance and step
      entries every day.
- [ ] Confirm every fixture covers July 28 through September 1, 2026, with a
      deterministic 5–20 entries per day. The switching fixture must retain both
      automatic sources and at least one manual entry on every day.
- [ ] Back up and force-stop only `com.middleearthchallenge.debug` before replacing
      its database. Never clear, uninstall, or overwrite `com.middleearthchallenge`.

- [ ] Existing `distance_entries` IDs, dates, miles, steps, and sources are
      unchanged unless a real sync updates the corresponding source record.
- [ ] `progress_snapshot.cache_version` changes from `0` to `1` after hydration.
- [ ] Snapshot miles and steps equal `SUM(distance_entries.miles)` and
      `SUM(distance_entries.steps)` for save ID `default`.
- [ ] Upgraded `user_settings.health_sync_format_version` starts at `0`.
- [ ] Intermediate compatibility chunks retain format `0`.
- [ ] Only the final successful compatibility chunk changes the format to `1`.
- [ ] `health_lookback_start_timestamp` is populated at the cutover boundary.
- [ ] New sharing fields remain disabled/null until explicit user opt-in.
- [ ] Reopening the converted app does not alter entry count or totals.

#### Legacy conversion sign-off

| Check                               | Rehearsal A | Rehearsal B |
| ----------------------------------- | ----------- | ----------- |
| In-place install accepted           |             |             |
| Startup completed                   |             |             |
| Miles preserved from entry sum      |             |             |
| Steps preserved from entry sum      |             |             |
| Entry count and identities correct  |             |             |
| Sources and dates preserved         |             |             |
| Settings preserved                  |             |             |
| Sharing remained off                |             |             |
| First Health Connect sync completed |             |             |
| Repeated sync was idempotent        |             |             |
| Repeated cold starts were stable    |             |             |

- [ ] Attach before/after screenshots and recorded totals to the release record.
- [ ] Any unexplained missing row, duplicate row, changed date/source, reduced
      total, automatic sharing opt-in, or unrecoverable startup failure blocks
      distribution.

### Fresh install (destructive)

- [ ] Uninstall the app or clear its storage.
- [ ] Install the Release candidate.
- [ ] First launch shows Welcome and starts with no journey progress.
- [ ] No tracking source is active until the user selects one.
- [ ] Distance displays its empty state without a phantom row.
- [ ] Denying optional permissions does not block manual-only use.

## Welcome and initial map reveal

- [ ] Test the Classic theme: Welcome uses the dark primary action treatment.
- [ ] Test the Minimalist theme: Welcome retains its brand action treatment.
- [ ] Dismiss Welcome with existing progress.
- [ ] Stats, Settings, Add Distance, Labels, Friends when available, distance,
      and steps controls share the same 300 ms entrance behavior.
- [ ] The path waits about 1 second, then draws for about 4 seconds.
- [ ] Reached trivia markers do not float ahead of the drawing path.
- [ ] When the path completes, reached trivia markers fade in smoothly over
      about 300 ms rather than appearing abruptly.
- [ ] Checkpoints remain intentionally visible throughout the reveal.
- [ ] The progress marker does not travel along a partially drawn base path.
- [ ] Wait at least 6 seconds if the visual animation appears interrupted; the
      path must become complete and reached trivia must appear.
- [ ] Background and foreground during the reveal; the screen eventually reaches
      the same completed state.
- [ ] Force-stop during the reveal and reopen; the path and trivia do not remain
      permanently hidden.
- [ ] Enable Android Remove animations or Reduce Motion before launch; the path
      and trivia complete immediately without missing content.

## Map and controls

- [ ] Pan and pinch-zoom smoothly at several map locations.
- [ ] Pan to an edge; map bounds prevent losing the map off-screen.
- [ ] Recenter appears only after map displacement and returns to the intended
      journey location.
- [ ] Labels toggles all checkpoint labels without moving checkpoint circles.
- [ ] Small, default, and large label sizes keep circles anchored to map points.
- [ ] Friends toggles friend markers when participants exist.
- [ ] Stats, Settings, Add Distance, Info, Recenter, Labels, Friends, distance,
      and steps controls each perform the expected action once per tap.
- [ ] Rapidly tap each control; duplicate modals or duplicate writes do not occur.
- [ ] Switch miles to kilometers; map controls, info distances, Stats, and entry
      forms all use the selected unit consistently.
- [ ] Classic journey progress uses the dark primary active fill.
- [ ] Minimalist journey progress retains the gold active fill.
- [ ] Light and dark system appearance do not produce unreadable text or icons.

## Checkpoints and trivia

Enable Dev Mode and use the test-distance override. Clear the override when this
section is complete.

- [ ] At 119 miles, Bree is locked; at 120 miles, Bree unlocks once.
- [ ] A newly reached checkpoint displays its celebration and correct content.
- [ ] Reopening a completed checkpoint does not replay a one-time notification.
- [ ] A large jump across multiple checkpoints handles every milestone once and
      in journey order.
- [ ] Repeating the same jump does not duplicate milestone notifications.
- [ ] At 1,235 miles, Mount Doom and journey completion render correctly.
- [ ] Every checkpoint marker, label, image, body, and distance is correct.
- [ ] Every trivia marker opens the matching image and copy.
- [ ] Verify recent trivia entries and marker placement:
  - [ ] Ford the River? at 308 miles uses `oregon-trail.jpg`.
  - [ ] The Pass of Caradhras at 492 miles uses `caradhras.jpg`.
  - [ ] Lembas Bread at 700 miles uses `lembas-bread.jpg`.
- [ ] Lembas Bread copy reads: “I hope you haven't eaten all your lembas bread
      yet. One small bite is enough to fill the stomach of a grown man.”
- [ ] Recent trivia artwork is sharp, correctly cropped, and not stretched.
- [ ] Trivia unlocks do not send checkpoint system notifications.

## Manual entries and validation

- [ ] Add distance with an integer and decimal value.
- [ ] Add steps with a whole-number value.
- [ ] Empty and zero submissions remain harmless no-ops.
- [ ] Negative, malformed, non-finite, and fractional-step values show specific
      inline feedback and do not save.
- [ ] Values above 5,000,000 are rejected; exactly 5,000,000 is accepted.
- [ ] Validation text does not shift or hide footer controls.
- [ ] Edit distance, steps, date, and time; the same row updates in place.
- [ ] Delete a manual row and cancel one deletion before confirming another.
- [ ] Native pedometer and Health Connect rows cannot be edited as manual data.
- [ ] Add, edit, and delete remain correct with the keyboard open and after rotation.

## Distance history

- [ ] Manual, pedometer, and Health Connect rows use truthful source labels.
- [ ] Only the latest synthetic pedometer row says `In progress`.
- [ ] Persisted pedometer and Health Connect rows display as completed records.
- [ ] The synthetic live row appears only while pedometer or dual mode is active.
- [ ] Dividers and badges are readable in Classic and Minimalist themes.
- [ ] In-progress, success, and neutral badges use distinct semantic colors.
- [ ] Scroll through more than seven days; the next page loads after the delay
      without duplicates, omissions, jumps, or reordered rows.
- [ ] Close the modal while a page is loading; no crash or stale update occurs.
- [ ] Totals remain unchanged by opening, paging, and closing history.

## Statistics

- [ ] Total distance and total steps agree with Map and Distance.
- [ ] Best day, weekly total, and daily average match known test entries.
- [ ] Health rows with measured steps retain them.
- [ ] Distance-only rows use the expected derived-step fallback.
- [ ] Units update consistently when switching miles and kilometers.
- [ ] Empty, short-history, and multi-week histories render without invalid values.

## Live step feedback

- [ ] In pedometer or dual mode, walk with Map open; the numeric step count updates.
- [ ] Initial hydration does not trigger the highlight.
- [ ] On a later increase, only the number changes to pale gold; `steps` does not.
- [ ] The cue fades in for about 200 ms, holds for about 600 ms, and fades out
      for about 200 ms.
- [ ] Additional steps during the cue restart the one-second highlight window.
- [ ] The color remains readable in Classic and Minimalist themes.

## Tracking source matrix

Test each supported state. Existing committed rows must remain unless the user
explicitly chooses a source-data deletion action.

| State               | Pedometer service | Health sync | Live steps | Expected new rows     |
| ------------------- | ----------------- | ----------- | ---------- | --------------------- |
| Manual only         | Off               | Off         | Hidden     | Manual only           |
| Health Connect only | Off               | On          | Hidden     | Health Connect        |
| Pedometer only      | On                | Off         | Visible    | Pedometer             |
| Dual                | On                | On          | Visible    | Both, without overlap |

- [ ] Transition through all four states in both directions.
- [ ] Source controls and Required Access text always match the active state.
- [ ] Turning one source off in dual mode leaves the other running.
- [ ] Turning all sources off stops sync and hides live steps.
- [ ] Existing rows survive source changes.
- [ ] No transition creates duplicate distance or loses an uncommitted pedometer
      window.
- [ ] A Health Connect read already in flight is not applied after ownership
      changes to pedometer, dual, or off.
- [ ] Entering Health Connect-only does not import an overlapping interval from
      before the transition.

## Pedometer and Android permissions

- [ ] Select Pedometer and grant Physical activity and Notifications.
- [ ] The persistent foreground-service notification appears.
- [ ] Walk at least 100 steps; the live steps chip updates within a few seconds.
- [ ] After the commit interval, one durable pedometer row appears.
- [ ] Background the app and walk; the foreground notification remains.
- [ ] Reopen; catch-up includes the background steps once.
- [ ] Swipe the app from Recents; recording and notification continue.
- [ ] Force-stop from Android App info; recording stops as Android requires.
- [ ] Reopen after force-stop; the app detects/restarts tracking and clearly
      reports any unrecoverable gap.
- [ ] Revoke Physical activity while active; the app warns and does not claim to
      be recording.
- [ ] Re-enable through the explicit recovery action; live counting resumes.
- [ ] Deny Notifications; the app explains required access and does not enter a
      misleading half-active state.
- [ ] Check stock battery optimization guidance and settings action.
- [ ] On Samsung, Xiaomi, Huawei, or another aggressive OEM when available,
      verify OEM background guidance and recovery actions.
- [ ] Reboot with pedometer active; service recovery and boot identity advance,
      and subsequent steps are counted without a total decrease.

## Health Connect

- [ ] Connect Health Connect and grant required Steps and Distance access.
- [ ] Initial sync completes and imports expected historical records.
- [ ] Add a known workout or walking record in the source fitness app; sync imports
      it once after Health Connect receives it.
- [ ] Sync Now gives visible progress and does not allow conflicting repeated work.
- [ ] Background and foreground during a provider read; the app remains responsive
      and applies only source-owned results.
- [ ] Revoke Health Connect access; the app gives a truthful recovery path.
- [ ] Restore access; sync recovers without duplicating prior rows.
- [ ] Test no-network/provider-unavailable conditions; warning copy is actionable.
- [ ] A successful later sync clears or resolves the appropriate warning.
- [ ] Permission and unknown errors do not display misleading generic sync text.

## Sync status and issue recovery

- [ ] During sync, the sync pill reports units and multipart progress accurately.
- [ ] The pill remains long enough to read and fades out without layout movement.
- [ ] Timeout, unavailable, provider, and pedometer-storage failures use distinct,
      truthful messages.
- [ ] Settings badge and warning accents are readable in both themes.
- [ ] Multiple unresolved issues appear in history/carousel without overwriting
      each other.
- [ ] Dismiss, retry, Sync settings, manual catch-up, battery settings, and app
      settings actions open the correct destination.
- [ ] Resolved issues do not remain active after a successful recovery.

## Background work and lifecycle

- [ ] With pedometer active, confirm WorkManager registers the periodic sweep.
- [ ] Force a Worker run in a controlled test build; it stays running until the
      Headless JS persistence promise finishes, then returns to scheduled state.
- [ ] A zero-step Worker window advances safely without creating an empty row.
- [ ] A non-zero Worker window creates exactly one row and advances its watermark.
- [ ] Simulate a controlled Worker failure when practical; WorkManager retries
      rather than reporting false success.
- [ ] Leave the Release app untethered and backgrounded for several hours; steps
      and battery behavior remain acceptable when reopened.
- [ ] Change timezone after recording data; totals remain monotonic and dates are
      sensible.
- [ ] Move the clock backward in a controlled test; no duplicate or negative
      distance appears. Restore automatic time afterward.
- [ ] Lock/unlock repeatedly and switch apps during sync; no stuck loading state.

## Friend sharing and Firebase

- [ ] Opt in and confirm the expected sharing identity/state appears.
- [ ] Add or load a participant; marker location and accessible name are correct.
- [ ] Friends toggle hides and restores friend markers.
- [ ] Background and foreground; participant data refreshes without duplicate calls
      or markers.
- [ ] Opt out; published sharing data is removed and does not return on restart.
- [ ] Release build can authenticate and use Firebase with App Check enabled.
- [ ] Debug and Release data/configuration remain isolated as intended.
- [ ] Network loss produces recoverable behavior without exposing private data.

## Themes, layout, and accessibility

- [ ] Complete Map, Welcome, Settings, Sync, Distance, Stats, checkpoint, trivia,
      and entry workflows in Classic and Minimalist themes.
- [ ] Warning, badge, splash, icon, divider, progress, and step-highlight colors
      remain readable and semantically consistent.
- [ ] Test portrait and landscape with the keyboard closed and open.
- [ ] Test Android's largest supported font and display sizes; text does not clip,
      overlap, or hide actions.
- [ ] Test a short/narrow phone and a tablet or emulator when available.
- [ ] With TalkBack, traverse Welcome, Map controls, every modal, entry editing,
      source controls, issue recovery, checkpoints, trivia, and friend markers.
- [ ] Every interactive control has an accurate name, role, state, and action.
- [ ] Modal focus enters the modal, background controls are not reachable, Back
      works predictably, and focus returns sensibly after close.
- [ ] Rapid Back, close, save, delete, and rotate actions do not leave an overlay
      or unresponsive screen.

## Performance and stability soak

- [ ] Cold start and first usable Map feel reasonable on the target phone.
- [ ] Map pan/zoom remains smooth with all marker types visible.
- [ ] Distance paging and Stats remain responsive with a large or multi-year history.
- [ ] A stalled provider read does not freeze navigation or cause unbounded retries.
- [ ] Run for at least 30 minutes with pedometer active; memory, temperature, and
      battery use remain reasonable and totals stay monotonic.
- [ ] Review Android logs for crashes, ANRs, repeated exceptions, failed Workers,
      React warnings, and sensitive health data.

## Distribution validation

- [ ] Upload the exact tested signed APK to the intended internal distribution
      channel.
- [ ] Download and install it through the user-facing App Tester flow.
- [ ] Upgrade over the previous distributed version without losing data.
- [ ] Confirm app name, icon, version, permissions, and install prompts are correct.
- [ ] Confirm the distributed binary works with Metro stopped.
- [ ] Draft release notes covering user-visible changes and permission changes.

## Final sign-off

### Blocking failures

| ID  | Section | Summary | Owner | Status |
| --- | ------- | ------- | ----- | ------ |
|     |         |         |       |        |

### Deferred non-blocking issues

| ID  | Reason accepted | Follow-up | Owner |
| --- | --------------- | --------- | ----- |
|     |                 |           |       |

- [ ] All critical-path items pass on the signed Release APK.
- [ ] Every failed full-regression item is fixed, explicitly accepted, or blocked
      with a documented reason.
- [ ] No known data-loss, duplicate-progress, permission, privacy, crash, or ANR
      issue remains.
- [ ] The tested commit, version, and uploaded artifact match.
- [ ] Release approved by: **\*\*\*\***\_\_\_\_**\*\*\*\*** Date: **\*\*\*\***\_\_\_\_**\*\*\*\***
