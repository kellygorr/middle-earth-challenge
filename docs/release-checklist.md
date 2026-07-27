# Release Checklist

Manual smoke tests to run before publishing a new build to TestFlight
or an internal Android track. The automated test suite covers pure
logic (see [`src/utils/__tests__/`](../src/utils/__tests__/),
[`src/constants/__tests__/`](../src/constants/__tests__/),
[`src/services/__tests__/`](../src/services/__tests__/), and
[`src/stores/__tests__/`](../src/stores/__tests__/)) — this file is
for everything a JS test suite can't verify: real permissions, real
health data, real notifications, real battery behaviour.

Run through the relevant sections. Not every item applies to every
release — call out patches that skip sections in the PR description.

---

## Pre-flight

- [ ] `npm test` passes locally
- [ ] `npm run lint` returns 0 errors (warnings acceptable if pre-existing)
- [ ] TypeScript compile passes: `npx tsc --noEmit`
- [ ] Version bumped in `package.json`, `ios/MiddleEarthChallenge/Info.plist`,
      and `android/app/build.gradle` (`versionName` + `versionCode`)
- [ ] `docs/TODO.md` reviewed — no ship-blocker items open

---

## Fresh install — Android (physical device)

1. [ ] Uninstall the previous build if present
2. [ ] Install release build
3. [ ] First launch: onboarding shows, `trackingMode === 'none'`
4. [ ] Skip onboarding → map screen renders at 0 miles
5. [ ] Distance list is empty; "no entries yet" placeholder shows

### Pedometer mode
6. [ ] Settings → pick pedometer → grant `ACTIVITY_RECOGNITION`
7. [ ] Grant `POST_NOTIFICATIONS`
8. [ ] Persistent foreground-service notification appears
9. [ ] Walk 100 steps → live chip on map screen ticks up within 2s
10. [ ] Wait for the 2-min commit → distance list gains one `pedometer` row
11. [ ] Kill the app from Recents → foreground notification stays
12. [ ] Reopen app → miles carry over; catch-up commit runs
13. [ ] Background → foreground → live chip refreshes immediately

### Health-app mode
14. [ ] Settings → switch to Health Connect
15. [ ] Grant Steps + Distance permissions
16. [ ] Sync completes; historical rows appear tagged `health-connect`
17. [ ] Manually add a workout in Health Connect → within 2 min it shows up
18. [ ] Airplane mode ON → sync fails with a banner (not silently)
19. [ ] Airplane mode OFF → next sync succeeds and clears the banner

### Manual entry
20. [ ] Tap `+` → enter distance → row saved with source `manual-distance`
21. [ ] Tap `+` → switch to steps → row saved with source `manual-steps`
22. [ ] Edit an existing manual entry → totals update everywhere
23. [ ] Delete a manual entry → totals reflect immediately

---

## Fresh install — iOS (physical device)

Pedometer mode is not supported on iOS today; verify `pedometer` picker
is either hidden or disabled.

1. [ ] Uninstall (long-press → Remove App → Delete)
2. [ ] Install release build
3. [ ] Onboarding shows; pedometer option is hidden/disabled
4. [ ] Grant Apple Health permissions (Steps + Distance)
5. [ ] Sync populates the distance list from HealthKit
6. [ ] Add a workout in the Fitness app → within 2 min it appears
7. [ ] Force-quit + relaunch → totals persist
8. [ ] Airplane mode → error banner → recover on reconnect

### iCloud caveat
9. [ ] Uninstall the app
10. [ ] Reinstall → check that data does **not** silently return via
       iCloud Backup (if it does, add a "reset all data" step to the
       user-facing release notes)

---

## Checkpoints & trivia

Use the dev tools (Settings → Dev Mode) to set miles quickly.

1. [ ] Set miles to just under Bree (119) → Bree modal is locked
2. [ ] Set miles to Bree (120) → celebration animation fires,
       checkpoint modal unlocks
3. [ ] Background the app, then trigger a pedometer commit that crosses
       Bree → system notification appears with Bree's description
4. [ ] Foreground: same setup → notification is suppressed (only the
       in-app celebration shows) but watermark advances
5. [ ] Set miles to a trivia point (200 = Weathertop) → trivia unlock
       fires (no notification for trivia by design)
6. [ ] Set miles past multiple checkpoints in one jump (e.g. 0 → 500) →
       all crossed checkpoints get exactly one notification each, in
       chronological order
7. [ ] Repeat the same jump a second time → **no** notifications fire
       (watermark guard works)
8. [ ] Set miles to `TOTAL_JOURNEY_MILES` (1235) → Mount Doom unlocks,
       end-of-journey UI shows

---

## Pedometer edge cases (Android)

1. [ ] Reboot the phone with pedometer active → open the app after
       reboot; miles reflect steps taken while the phone was off (via
       hardware step counter)
2. [ ] Long walk (30+ min) → returns to app; all steps accounted for
       across the WorkManager 4-hour periodic
3. [ ] Force-stop the app from Android settings → foreground service
       ends; walk 100 steps; reopen → gap is filled from
       `TYPE_STEP_COUNTER` on next commit
4. [ ] Battery optimizer set to "restricted" on a Samsung/Xiaomi
       device → prompt appears offering to open OEM settings
5. [ ] Toggle tracking mode: pedometer → health-app → pedometer within
       one session → no duplicate rows, no lost windows

---

## Sync source switching

1. [ ] Pedometer → Health-app: uncommitted pedometer window flushes
       first (no lost steps)
2. [ ] Health-app → Pedometer: existing health rows preserved; live
       chip appears; new pedometer rows accumulate
3. [ ] Any mode → None: sync stops; existing rows preserved; live chip
       hidden

---

## Regression sweeps (run after non-trivial changes)

- [ ] Landscape mode: onboarding, map, distance list, settings all
      render correctly
- [ ] Very tall / very short devices (Pixel 6a, iPhone SE): footer
      buttons never clipped
- [ ] Dark mode: no unreadable text
- [ ] Turn `useMiles` off → all UI switches to km
- [ ] Text-size = large: all labels scale without overflowing

---

## Sign-off

- [ ] Signed APK uploaded to Play Console internal track
- [ ] IPA uploaded to TestFlight
- [ ] Release notes drafted
- [ ] Tag pushed: `git tag vX.Y.Z && git push --tags`
