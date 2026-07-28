import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * Pedometer service — Android-only for now.
 *
 * Wraps the native `PedometerModule` which owns the foreground
 * `StepCounterService`, persists step samples to SQLite, and provides
 * time-window step queries. See docs/pedometer-mode.md for architecture
 * and Kotlin sources under `android/app/src/main/java/com/middleearth-
 * challenge/pedometer/`.
 *
 * On iOS, every method returns an "unsupported" outcome so the rest of
 * the app can call this safely without platform-guards at every call
 * site. iOS parity is tracked as a TODO in docs/pedometer-mode.md.
 */

// ---- Shapes ----

export interface PedometerEnvironment {
  /** ACTIVITY_RECOGNITION granted (or <API 29). */
  activityRecognition: boolean;
  /** POST_NOTIFICATIONS granted (or <API 33). */
  postNotifications: boolean;
  /** Device has a TYPE_STEP_COUNTER sensor. */
  hasSensor: boolean;
  /** Stock Android battery-optimization allowlist state. */
  ignoresBatteryOptimizations: boolean;
  /** e.g. "samsung", "google", "xiaomi" (lowercase caller-normalized). */
  manufacturer: string;
  /** Build.VERSION.SDK_INT. */
  sdkInt: number;
}

export interface StepsWindow {
  steps: number;
  fromMs: number;
  toMs: number;
}

export interface PedometerService {
  /** True iff the current platform can offer pedometer mode at all. */
  isSupported(): boolean;
  /**
   * Attempts to start the foreground step-counter service. Rejects if
   * permissions are missing or the device lacks a step sensor. Idempotent.
   */
  startTracking(): Promise<boolean>;
  /** Stops the service and dismisses its notification. Idempotent. */
  stopTracking(): Promise<boolean>;
  /**
   * Whether the foreground service is currently alive. Used to detect
   * silent OS kills (Samsung/Xiaomi/OEM battery managers). See
   * docs/pedometer-mode.md § Phase 5a.
   */
  isServiceRunning(): Promise<boolean>;
  /**
   * Sum of steps within [fromMs, toMs]. Handles reboots at the DB layer.
   * Returns 0 for empty/inverted ranges or when nothing is recorded.
   */
  getStepsBetween(fromMs: number, toMs: number): Promise<StepsWindow>;
  /** Snapshot of the device / permission state we care about. */
  getEnvironment(): Promise<PedometerEnvironment>;
  /**
   * Requests the ACTIVITY_RECOGNITION runtime permission. On <API 29 this
   * resolves true without prompting. On API 33+, POST_NOTIFICATIONS is
   * requested in the same call so the foreground service notification can
   * appear.
   */
  requestRuntimePermissions(): Promise<{
    activityRecognition: boolean;
    postNotifications: boolean;
  }>;
  /**
   * Opens the stock-Android "ignore battery optimizations" system prompt.
   * Resolves once the user's decision has been dispatched to the OS (we
   * don't observe the resulting state until the next getEnvironment).
   */
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  /**
   * Best-effort deep-link into the OEM battery-management screen (Samsung
   * Device Care, Xiaomi Autostart, etc.). Falls back to generic app info
   * on unknown OEMs.
   */
  openOemBatterySettings(): Promise<boolean>;
  /**
   * Posts a system notification celebrating a journey milestone (e.g.
   * crossing a checkpoint). `checkpointIndex` distinguishes concurrent
   * milestones so multiple notifications can stack in the shade.
   *
   * Best-effort: resolves `false` (rather than rejecting) when the OS
   * has denied POST_NOTIFICATIONS or when notifications are unsupported
   * on the current platform. The caller should not treat that as a
   * hard failure — the pedometer commit path continues regardless.
   */
  fireMilestoneNotification(
    title: string,
    body: string,
    checkpointIndex: number,
  ): Promise<boolean>;
}

// ---- Android implementation ----

const AndroidPedometer: PedometerService = {
  isSupported: () =>
    Platform.OS === 'android' && !!NativeModules.PedometerModule,

  startTracking: () => NativeModules.PedometerModule.startTracking(),

  stopTracking: () => NativeModules.PedometerModule.stopTracking(),

  isServiceRunning: () => NativeModules.PedometerModule.isServiceRunning(),

  getStepsBetween: (fromMs, toMs) =>
    NativeModules.PedometerModule.getStepsBetween(fromMs, toMs),

  getEnvironment: () => NativeModules.PedometerModule.getEnvironment(),

  requestRuntimePermissions: async () => {
    // We route the two runtime permissions through RN's PermissionsAndroid so
    // the app-level rationale UI can hook in later; the native module already
    // reports state via getEnvironment.
    const results: {
      activityRecognition: boolean;
      postNotifications: boolean;
    } = { activityRecognition: true, postNotifications: true };

    if (Number(Platform.Version) >= 29) {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      );
      results.activityRecognition = res === PermissionsAndroid.RESULTS.GRANTED;
    }

    if (Number(Platform.Version) >= 33) {
      const res = await PermissionsAndroid.request(
        // Cast: POST_NOTIFICATIONS was added in RN 0.70+ but older type defs
        // may not include it. Runtime value is 'android.permission.POST_NOTIFICATIONS'.
        'android.permission.POST_NOTIFICATIONS' as Parameters<
          typeof PermissionsAndroid.request
        >[0],
      );
      results.postNotifications = res === PermissionsAndroid.RESULTS.GRANTED;
    }

    return results;
  },

  requestIgnoreBatteryOptimizations: () =>
    NativeModules.PedometerModule.requestIgnoreBatteryOptimizations(),

  openOemBatterySettings: () =>
    NativeModules.PedometerModule.openOemBatterySettings(),

  fireMilestoneNotification: (title, body, checkpointIndex) =>
    NativeModules.PedometerModule.fireMilestoneNotification(
      title,
      body,
      checkpointIndex,
    ),
};

// ---- iOS stub ----
//
// TODO(ios): Implement pedometer mode using CMPedometer.startUpdates for
// live foreground counting and queryPedometerData(from:to:) for backfill
// on resume. iOS retains up to 7 days of retrospective pedometer data
// without needing a foreground service. See docs/pedometer-mode.md.

const UnsupportedError = () =>
  new Error('Pedometer mode is not yet supported on this platform');

const IosPedometer: PedometerService = {
  isSupported: () => false,
  startTracking: () => Promise.reject(UnsupportedError()),
  stopTracking: () => Promise.resolve(true),
  isServiceRunning: () => Promise.resolve(false),
  getStepsBetween: (fromMs, toMs) =>
    Promise.resolve({ steps: 0, fromMs, toMs }),
  getEnvironment: () =>
    Promise.resolve({
      activityRecognition: false,
      postNotifications: false,
      hasSensor: false,
      ignoresBatteryOptimizations: false,
      manufacturer: 'apple',
      sdkInt: 0,
    }),
  requestRuntimePermissions: () =>
    Promise.resolve({ activityRecognition: false, postNotifications: false }),
  requestIgnoreBatteryOptimizations: () => Promise.resolve(false),
  openOemBatterySettings: () => Promise.resolve(false),
  // iOS milestone notifications are not implemented — pedometer mode
  // itself is Android-only, so this stub only exists so `pedometerService`
  // stays call-safe from cross-platform code.
  fireMilestoneNotification: () => Promise.resolve(false),
};

export const pedometerService: PedometerService =
  Platform.OS === 'android' ? AndroidPedometer : IosPedometer;
