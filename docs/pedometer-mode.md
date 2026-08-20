# Pedometer Mode (Android)

Real-time step counting via the phone's raw step sensor, running in a
foreground service so counting continues with the app backgrounded / screen
off. Presented to the user as a second **Tracking Source** option alongside
the existing **Health App** (Health Connect on Android / Apple Health on iOS)
mode.

Scope of this doc: **Android implementation.** iOS is TODO — see stubs at the
bottom.

---

## Why

- Health Connect / Google Fit publish lag makes the current sync feel
  unresponsive during an active walk (3 min interval + minutes of upstream
  lag).
- Direct sensor subscription updates within seconds, matching the feel of
  step-count-driven apps like Pikmin Bloom.
- Users pick their trade: **Health App** (zero background battery, journal-
  style latency) vs **Pedometer** (real-time updates, persistent notification,
  small background battery cost).

## Design principles

1. **Modes are mutually exclusive.** Only one tracking source is active at a
   time. This is the whole reason we can avoid the double-counting problem —
   we never read both sources for overlapping time windows.
2. **Permissions persist independently of the active mode.** Switching modes
   does _not_ revoke anything at the OS level; only Android Settings can do
   that. We only request permissions the first time a user opts into a mode.
3. **Mode switch resets sync bookmarks** to prevent silent double-import when
   swapping back: `lastSyncTimestamp = Date.now()` at the moment of switch,
   plus clearing any lingering error state.
4. **Existing entries stay put** across mode switches. `distanceEntries` with
   `source: 'health-connect' | 'apple-health' | 'pedometer' | 'manual'` all
   coexist. Total miles is just their sum.
5. **iOS parity ships later.** Android-only for the first release; TS
   pedometer service stub returns unsupported on iOS so the setting is
   hidden in the UI on that platform.

## Architecture

```
┌─────────────────────────────────────┐
│           Settings modal             │
│  ┌────────────────────────────────┐ │
│  │ Tracking source:               │ │
│  │   ( ) Health app (default)     │ │
│  │   (•) Live pedometer           │ │
│  └────────────────────────────────┘ │
└──────────────┬──────────────────────┘
               │  trackingMode setting
               ▼
   ┌────────────────────────┐
   │  useSyncInterval hook  │
   │  branches on mode:     │
   └────┬──────────────┬────┘
        │              │
   'health-app'   'pedometer'
        │              │
        ▼              ▼
 ┌─────────────┐  ┌────────────────────────┐
 │ fitness     │  │ pedometerService (TS)  │
 │ Service     │  │  ├─ startTracking()    │
 │ (current)   │  │  ├─ stopTracking()     │
 └─────────────┘  │  ├─ getStepsBetween()  │
                  │  └─ requestPerms()     │
                  └──────────┬─────────────┘
                             │ Native bridge
                             ▼
                  ┌────────────────────────┐
                  │ PedometerModule (Kt)   │
                  └──────────┬─────────────┘
                             │ startForegroundService()
                             ▼
                  ┌────────────────────────┐
                  │ StepCounterService     │
                  │  ├─ SensorEventListener│
                  │  │   (TYPE_STEP_COUNTER)│
                  │  ├─ Persists deltas    │
                  │  │   to Room DB         │
                  │  └─ Persistent notif    │
                  └────────────────────────┘
```

## State on mode switch

Both directions (health-app → pedometer, pedometer → health-app):

- [ ] **If leaving pedometer mode:** call `commitPedometerRange(watermark, now)`
      first — otherwise uncommitted steps between the last 2-min commit and
      the switch instant are silently dropped by the watermark reset below.
- [ ] `settingsStore.trackingMode` — set to new mode
- [ ] `settingsStore.lastSyncTimestamp = Date.now()` — prevents backfill
      overlap; also resets the pedometer watermark
- [ ] `progressStore.lastSyncDate = null` — clears "last synced Xm ago" UI
- [ ] `progressStore.syncStatus = initialSyncStatus` — clears syncing/error
- [ ] `progressStore.lastSyncError = null`, `lastSyncErrorAt = null`
- [ ] Start or stop the pedometer foreground service accordingly
- [ ] When stopping, persist `pedometerCleanupPending = true` with the source
      transition, then clear it only after native cleanup succeeds. Cold start
      and foreground resume retry this idempotent cleanup before mode checks.

health-app → pedometer specifically:

- [ ] Request `ACTIVITY_RECOGNITION` + `POST_NOTIFICATIONS` if not already
      granted. Fail the switch on denial.
- [ ] Once running, prompt for `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (see
      Phase 5a).

pedometer → health-app specifically:

- [ ] Existing pedometer `DistanceEntry` rows stay in the DB — they are the
      user's real recorded miles. We just stop _creating new ones_.

## Row model & commit strategy

Health Connect returns records with real start/end times — each becomes one
`DistanceEntry` row. Pedometer data has no natural "record" boundaries; it's
a continuous stream of raw step samples in the native SQLite DB. **We** pick
where rows begin and end.

### The watermark

`settingsStore.lastSyncTimestamp` doubles as the pedometer **watermark**:
the exclusive upper bound of what's already been turned into
`DistanceEntry` rows. Every commit reads
`getStepsBetween(watermark, now)`, writes a row (if steps > 0), and
advances the watermark to `now`. Rows never overlap in time. No data is
double-counted, no data is silently dropped.

### Commit cadences

| Mode                     | Cadence                    | Typical row length |
| ------------------------ | -------------------------- | ------------------ |
| Live (app foregrounded)  | Every 2 minutes            | ~2 min             |
| Background (WorkManager) | 5× per day (~every 4.8 hr) | ~4.8 hr            |

Row length varies at edges — a mode-switch or app-close mid-window
produces a shorter row; a delayed WorkManager tick or a long backfill
produces a longer one. That's fine: the sum of miles is always correct.

**Empty windows do not create rows.** If `steps === 0` between watermark
and now, we skip the write, still advance the watermark. Idle overnight
periods do not clutter the Distance list.

### All commit triggers (all call the same `commitPedometerRange()`)

| Trigger                                                        | Purpose                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2-min live timer while foregrounded                            | Standard live commit                                                     |
| WorkManager 5×/day                                             | Standard BG commit                                                       |
| App resume (`AppState` → `'active'`)                           | Catch-up for the gap since last commit                                   |
| App backgrounding (`AppState` → `'background'` / `'inactive'`) | Flush orphan tail before JS pauses                                       |
| **Mode switch away from pedometer**                            | Flush orphan before losing the mode context (otherwise silent data loss) |
| Sync-Now button                                                | Manual on-demand commit                                                  |

### Display refresh (separate from commit)

The map screen's miles counter refreshes **every 2 seconds** while
foregrounded by reading `getStepsBetween(watermark, now)` and adding
those in-flight miles to the displayed total. This is display-only —
nothing is persisted. Without it the counter would freeze between
2-minute commits.

`useSyncInterval` handles this 2s refresh; commits are on their own
2-minute timer inside the same hook.

### Multi-week catch-up scenario

User doesn't open the app for 3 weeks.

- WorkManager fires ~5× per day the whole time — assuming battery-saver
  hasn't killed it — writing one row per BG tick when the user walked.
- User re-opens. `lastSyncTimestamp` is at most one WorkManager interval
  behind. Forced sync commits one row for that final gap. Done.
- If WorkManager was killed by OEM battery-saver: last watermark could
  be days old. Forced sync commits one row for the entire dead period
  — still correct, just less granular.

Data is safe in all cases because raw step samples live in the native
DB continuously, independent of what the JS side is doing.

## Android permissions required

- `ACTIVITY_RECOGNITION` (Android 10+, runtime)
- `POST_NOTIFICATIONS` (Android 13+, runtime — for the foreground service
  notification)
- `FOREGROUND_SERVICE` (manifest)
- `FOREGROUND_SERVICE_HEALTH` (Android 14+, manifest — matches our
  `foregroundServiceType="health"`)

## Task breakdown

### Phase 0: Health-app-mode responsiveness prerequisites

These don't require any pedometer code but tighten up the mode the user
lands on by default and clean up UI that stops making sense once a second
mode exists.

- [ ] Drop `SYNC_INTERVAL_MS` from `3 * 60 * 1000` → `30 * 1000` in
      [useSyncInterval.ts](../src/hooks/useSyncInterval.ts). Foreground-only
      polling; battery cost is negligible.
- [ ] `liveSyncEnabled` toggle is only meaningful in health-app mode
      (pedometer is inherently live). Hide it from the Sync modal when
      `trackingMode === 'pedometer'`, and force-treat it as `true` in the
      sync flow under pedometer mode. Consider deprecating the flag entirely
      once pedometer mode is stable.

### Phase 1: Native scaffolding

- [ ] `AndroidManifest.xml`
  - [ ] Add the four permissions above
  - [ ] Declare `<service android:name=".StepCounterService"
android:foregroundServiceType="health" android:exported="false" />`
- [ ] `StepCounterService.kt` (foreground service)
  - [ ] Subscribes to `SensorManager` for `Sensor.TYPE_STEP_COUNTER`
  - [ ] Persists step deltas (step_count, timestamp) to a Room DB
  - [ ] `startForeground()` with health-category persistent notification
  - [ ] Handles service kill / restart (return `START_STICKY`)
- [ ] `PedometerModule.kt` (React Native native module)
  - [ ] `startTracking(promise)` — starts the service, checks perms
  - [ ] `stopTracking(promise)` — stops the service, dismisses notif
  - [ ] `getStepsBetween(fromMs, toMs, promise)` — reads Room DB
  - [ ] `isTracking(promise)` — service state check
  - [ ] `requestPermissions(promise)` — requests ACTIVITY_RECOGNITION +
        POST_NOTIFICATIONS
- [ ] `PedometerPackage.kt` (ReactPackage)
- [ ] Register `PedometerPackage` in `MainApplication.kt`

### Phase 2: JS side

- [ ] `src/services/pedometerService.ts`
  - [ ] Wraps the native module on Android
  - [ ] iOS stub that throws / returns unsupported (TODO)
- [ ] `src/stores/settingsStore.ts`
  - [ ] Add `trackingMode: 'health-app' | 'pedometer'` (default
        `'health-app'`)
  - [ ] Add `setTrackingMode()` action
  - [ ] Persist through database.updateUserSettings
- [ ] `src/hooks/useTrackingMode.ts` (new) — encapsulates the mode-switch
      logic (reset bookmarks, start/stop service, request perms). Called from
      the settings UI.

### Phase 3: Sync flow integration

- [ ] `src/hooks/useSyncInterval.ts` — branch on `trackingMode`. Health-app
      path is unchanged.
- [ ] `commitPedometerRange(fromMs?, toMs?)` helper (defaults to
      `[watermark, now]`):
  - [ ] Reads `pedometerService.getStepsBetween(fromMs, toMs)`
  - [ ] Converts to miles via `AVERAGE_STRIDE_METERS × METERS_TO_MILES`
  - [ ] If steps > 0: inserts one `DistanceEntry` (`source: 'pedometer'`,
        `id: pedo_${fromMs}`, `date: fromMs`)
  - [ ] Always advances `lastSyncTimestamp` (watermark) to `toMs`
- [ ] Wire commit triggers:
  - [ ] Live 2-min timer while foregrounded
  - [ ] AppState `'active'` → forced commit (catch-up)
  - [ ] AppState `'background' | 'inactive'` → forced commit (flush orphan)
  - [ ] Mode-switch away from pedometer → forced commit (see Phase 2
        `useTrackingMode`)
  - [ ] Sync-Now button → forced commit
- [ ] Separate 2s display-refresh timer while foregrounded: read
      `getStepsBetween(watermark, now)` and add to displayed miles total.
      No DB writes. Keeps the map-screen counter feeling live between
      commits. (Live only — background never runs JS.)

### Phase 3b: Background execution — WorkManager + Headless JS

- [ ] Add `androidx.work:work-runtime-ktx` (or KTX equivalent) to
      `android/app/build.gradle`.
- [ ] `PedometerBackgroundWorker.kt`:
  - [ ] Extends `Worker` / `CoroutineWorker`
  - [ ] Schedules a Headless JS task
- [ ] JS side: `AppRegistry.registerHeadlessTask('PedometerSweep', () =>
pedometerBackgroundTask)`
  - [ ] Same `commitPedometerRange()` used by live path
  - [ ] Also checks whether any journey checkpoint was crossed since last
        run; if so, fires a local notification
- [ ] Schedule as `PeriodicWorkRequest` with 4-hour interval (min allowed
      is 15 min; ~4-5 hours = 5×/day is enough for our commit cadence and
      milestone-notification purposes).
- [ ] Only schedule when `trackingMode === 'pedometer'`; cancel work on
      mode switch away.

### Phase 3c: Milestone notifications

- [x] Every pedometer commit path (`commitPedometerRange`) compares
      `progressStore.miles` before and after ingesting the new row. If
      the miles crossed one or more checkpoint boundaries (from
      `constants/checkpoints.json`), fires one system notification per
      crossing: "You reached {checkpointName}!". Applies to the live
      2-minute tick, AppState catch-up flush, WorkManager background
      sweep, mode-switch flush, and Sync-Now — anywhere
      `commitPedometerRange` is called. Health-app sync commits do
      **not** fire milestone notifications yet.
- [x] Local notifications channel: `middle_earth_milestones` (in
      `PedometerModule`), separate from the foreground-service channel.
      IMPORTANCE_DEFAULT with sound + vibration. Tap-to-open the app.
- [x] Guard against duplicate notifications: persist
      `lastNotifiedCheckpointIndex` in `settingsStore` (SQLite
      `user_settings.last_notified_checkpoint_index`, default `-1`).
      Only notify for indexes greater than it; the highest-index
      checkpoint processed in a call becomes the new watermark.
- [x] Foreground suppression: when `AppState.currentState === 'active'`
      we skip posting the system notification (map-screen celebration +
      auto-opening checkpoint modal already mark the crossing). The
      watermark is still advanced so backgrounded catch-up doesn't
      re-notify.

### Phase 4: UI

- [x] Sync modal: two-radio Tracking Source selector at the top; hide
      `liveSyncEnabled` when in pedometer mode (it's implicitly on).
      Revoke-access section, permission-gated visibility, in-session revoke
      banner. **PAUSED mid-flight** — see progress log 2026-07-22 entries.
      Remaining polish: pedometer permission/tracking status rows,
      OEM battery-saver copy under the pedometer radio, source label
      in Distance list rows.
- [x] **Map screen — step counter under miles (pedometer mode only).**
      When `trackingMode === 'pedometer' && syncEnabled`, show a small
      step-count subtitle directly below the total-miles readout in the
      top-left. Landed with a small twist: the chip shows _cumulative
      lifetime steps_ (from the persisted `progress_snapshot`) plus the
      live open-range delta since the last sync, so it ticks up in real
      time as the user walks. Hidden in all other modes.
- [x] **Distance screen — current in-progress steps row.**
      When pedometer mode is active, a synthetic "live" row appears at
      the top of today's group representing the steps that have
      accumulated since the last committed pedometer row but haven't
      yet been rolled up into a persisted range. Sourced by the shared
      `useLivePedometerDelta()` hook (also used by the map-screen
      total-steps chip) — polls `pedometerService.getStepsBetween(
lastSyncTimestamp, now)` every 5 s and on foreground-return.
      Row has no edit affordance and its "live" label flashes between
      the theme text color and yellow (`#F5A623`) so it clearly reads
      as in-flight. When the next commit lands the live delta drops to
      zero and the row disappears; a real committed entry takes its
      place. If today has no committed rows yet, a synthetic today
      group is prepended containing only the live row.

### Phase 5: Robustness

- [ ] Foreground check: on `AppState` → `'active'`, re-verify the active
      mode's permissions are still granted; show a banner if revoked.
- [ ] `BOOT_COMPLETED` receiver — restart the foreground service after
      device reboot if `trackingMode === 'pedometer'`. Uses
      `LOCKED_BOOT_COMPLETED` too for direct-boot devices. Reads mode from
      SharedPreferences (settings DB not accessible pre-user-unlock).
      Foreground-service-from-broadcast on Android 12+ is allowed because
      we use `foregroundServiceType="health"`.
- [ ] Battery Optimization allowlist prompt: modern Android will kill our
      service after ~1 hr under Doze unless the user allows-listed us.
      One-time prompt when pedometer mode is first enabled (see 5a).

Foreground services with persistent notifications survive stock Android
just fine, but Samsung / Xiaomi / OnePlus / Oppo / Huawei each layer their
own aggressive kill policies on top. Without OEM-aware handling, testers on
these phones will see the service die silently after backgrounding. See
[dontkillmyapp.com](https://dontkillmyapp.com) for the current OEM matrix.

- [ ] **Stock Android baseline**: on first pedometer-mode enable, request
      `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` via
      `Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)`.
      Covers Pixel, Motorola, most tablets.
- [ ] **OEM-specific deep links**: detect manufacturer via `Build.MANU-
FACTURER` and, when possible, deep-link the user to the correct
      OEM settings page with instructions. Ship at least Samsung and
      Xiaomi for MVP; the others are lower-volume.
  - Samsung: Settings → Battery → Battery usage → \<app\> → set
    "Allow background activity" and "Unrestricted"
  - Xiaomi: Security app → Permissions → Autostart → enable for our app
  - OnePlus/Oppo: Settings → Battery → Battery optimization →
    App-specific → "Don't optimize"
- [ ] **Soft-fail detection**: on `AppState` → `'active'` in pedometer
      mode, ask the native module "is the service actually running?" If
      the user expected it to be running but it's dead, show a banner:
      "Step tracking was stopped by your phone's battery saver. [Fix
      settings]" that opens the appropriate OEM screen.
- [ ] **In-mode UI copy** in the Sync modal, under the pedometer radio:
      "On some phones (especially Samsung), you may need to allowlist
      Middle-earth Challenge in your Battery settings for background
      tracking to work reliably."
- [ ] **Revisit "without draining your battery" copy** under the
      Pedometer radio. Current copy: _"Lightweight background tracking —
      counts steps even when the app is closed, without draining your
      battery."_ Technically defensible (hardware-offloaded step
      counter, coarse commit cadence, no GPS/wake-locks) but "without
      draining your battery" is a strong absolute. Softer alternatives
      to consider: _"designed to be gentle on your battery"_, _"with
      minimal battery impact"_, or just drop the trailing clause and
      let "Lightweight" carry it.
- [ ] Document the OEM matrix in [pedometer-mode-oems.md](./pedometer-mode-oems.md)
      as we iterate on testers' real phones.

### Phase 6: Ship

- [ ] Bump to `1.1.0 / versionCode 11` (real feature, not fix)
- [ ] Build APK
- [ ] Upload to Firebase App Distribution
- [ ] Update tester notes

## Testing checklist (on real Android device)

- [ ] Fresh install → default mode is `'health-app'`, app behaves as before
- [ ] Switch to pedometer → permission prompts appear, service starts,
      persistent notification visible
- [ ] Walk with app foregrounded → miles tick up within seconds
- [ ] Lock phone, walk 100 steps → unlock, open app → miles reflect the walk
- [ ] Close app entirely (swipe from recents) → walk 100 steps → notification
      still visible, service still running → open app → miles reflect walk
- [ ] Toggle back to `'health-app'` → notification dismissed, service dies,
      current sync flow resumes with `lastSyncTimestamp = now`
- [ ] Revoke `ACTIVITY_RECOGNITION` in Android Settings while in pedometer
      mode → return to app → banner appears, service stopped
- [ ] Deny permission on first switch → mode stays `'health-app'`, error
      shown
- [ ] Deny `POST_NOTIFICATIONS` on Android 13+ → foreground service still
      technically legal but user has no way to see it; decide UX
- [ ] Device reboot → service auto-restarts via BOOT_COMPLETED, notification
      returns without user opening the app
- [ ] Low-power mode / Doze → service survives reasonable duration (1 hr+)
- [ ] **Commit strategy** — with pedometer mode active:
  - [ ] Walk 200 steps with app open → within 2 min a new row appears in
        Distance list with ~0.1 mi
  - [ ] Walk 200 steps with app open → close app immediately (swipe from
        recents) → reopen → the last <2 min are recovered as one row
  - [ ] Walk with app closed for several hours → 4-5 rows appear per day
        in Distance list (WorkManager ticks)
  - [ ] Sit still overnight with app closed → no zero-mile rows appear
  - [ ] Switch pedometer → health-app mid-walk → orphan row for the tail
        appears before mode changes; no steps lost
  - [ ] Uninstall app while service running → notification dismissed, all
        DB rows cleared on reinstall (standard Android behavior)
  - [ ] Cross a checkpoint boundary while app closed → milestone
        notification fires from WorkManager sweep
- [ ] **OEM survival matrix** — test each of these on real hardware once
      available:
  - [ ] Pixel / stock Android — expect: works out of the box
  - [ ] Samsung Galaxy (One UI) — expect: works only after user allows
        "Unrestricted" in Battery settings
  - [ ] Xiaomi / Redmi (MIUI/HyperOS) — expect: needs Autostart enabled
  - [ ] OnePlus / Oppo (ColorOS) — expect: needs battery optimization
        exception

## Open questions

- [ ] Do we let power-users switch modes freely, or lock into one for the
      duration of a save? (Probably freely, but flag confusing UX.)
- [ ] Should pedometer step data also flow into Health Connect (as a writer)
      so users can see it in their normal health tracking? Probably no —
      keeps our scope narrower, avoids WRITE permission requests.
- [ ] Stride length: we currently use `AVERAGE_STRIDE_METERS = 0.762`. Do we
      want to expose a user-adjustable stride setting under pedometer mode?
      Health Connect uses actual measured distance when available, so this
      matters more under pedometer mode. MVP: fixed constant; note as follow-
      up.

## iOS TODO

- Design decision: use `CMPedometer.startUpdates` (foreground) +
  `queryPedometerData(from:to:)` (backfill on resume). iOS retains 7 days
  of retrospective pedometer data without needing a service, so we don't
  need the equivalent of Android's foreground service.
- Permission: `NSMotionUsageDescription` in Info.plist.
- Background modes: `UIBackgroundModes: ['fetch']` if we want periodic
  wake-up; otherwise foreground + on-resume is enough.
- Native module: mirror the API surface of Android's PedometerModule.
- Ship separately once Android is validated in the wild.

## Progress log

- **2026-07-22** — Design doc created. No code yet.
- **2026-07-22** — Native scaffolding, JS bridge, settings store, mode-switch
  handler landed (todos 1-9). Daily-bucket sync implementation drafted but
  not shipped.
- **2026-07-22** — Commit strategy finalized: watermark-based, variable row
  lengths, 2-min live commits, 5×/day BG commits via WorkManager. Empty
  windows skipped. Flush on app close and mode switch. 2-second display
  refresh separate from commit cadence. Daily-bucket draft to be replaced
  with this model. Milestone notifications and BOOT_COMPLETED moved from
  "deferred" into Phase 3c and Phase 5 respectively.
- **2026-07-22** — Sync-modal UX overhaul: removed inline stop-syncing
  buttons in favor of tap-active-radio-to-toggle-off; added a Revoke
  access section with per-source blocks (Pedometer → Open app settings;
  Health Connect → Revoke Health Connect access with post-revoke banner);
  permission-gated block visibility; auto-repair for permission drift on
  hydrate + `AppState.active`; `fitnessService.disconnect` /
  `revokePermissions` split; removed Live sync toggle. `pedometerStopped`
  SyncError kind removed — we can't reliably attribute cause (OEM battery
  manager vs. revoked permission vs. boot race), so a confident banner
  would misinform. **Sync-modal work paused mid-flight** — remaining polish
  tracked under Phase 4 Sync-modal bullet.
- **2026-07-22** — Two Android native crashes fixed:
  1. `SecurityException: Starting FGS with type health` — added
     `FOREGROUND_SERVICE_HEALTH` to the manifest (required for typed
     foreground services on targetSdk 34+).
  2. `IllegalStateException: Tried to start task PedometerSweep while in
foreground` — flipped `allowedInForeground` to `true` in
     `PedometerHeadlessJsService.getTaskConfig`. WorkManager may fire the
     sweep while the app is foregrounded, and the watermark-based commit
     is idempotent so a foreground-run is harmless (worst case: a
     near-zero-step row for a near-empty window).
