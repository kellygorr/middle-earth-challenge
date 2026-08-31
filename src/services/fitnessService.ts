import { Platform } from 'react-native';
import { HealthDistanceRecord, SyncProvider } from '../types';
import {
  AVERAGE_STRIDE_METERS,
  metersToMiles,
  milesToMeters,
  milesToSteps,
  stepsToMiles,
} from '../utils/stride';

/**
 * Fitness service abstraction layer
 * Handles health data from Apple Health (iOS) and Health Connect (Android)
 */

export interface FitnessServiceInterface {
  initialize(provider?: SyncProvider): Promise<void>;
  requestPermissions(provider?: SyncProvider): Promise<boolean>;
  disconnect(): Promise<void>;
  getDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]>;
  getLegacyDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]>;
  isAvailable(): Promise<boolean>;
  checkSdkStatus(): Promise<{
    available: boolean;
    status: 'available' | 'unavailable' | 'update_required';
  }>;
}

// Lazy load platform-specific modules to prevent crashes
let healthConnectModule: typeof import('react-native-health-connect') | null =
  null;
let appleHealthModule: typeof import('react-native-health') | null = null;

async function getHealthConnectModule() {
  if (Platform.OS !== 'android') return null;
  if (!healthConnectModule) {
    healthConnectModule = await import('react-native-health-connect');
  }
  return healthConnectModule;
}

async function getAppleHealthModule() {
  if (Platform.OS !== 'ios') return null;
  if (!appleHealthModule) {
    appleHealthModule = await import('react-native-health');
  }
  return appleHealthModule;
}

type HealthConnectAggregator = Pick<
  typeof import('react-native-health-connect'),
  'aggregateRecord'
>;

type HealthConnectRecordReader = Pick<
  typeof import('react-native-health-connect'),
  'readRecords'
>;

interface DailyHealthSample {
  value: number;
  startDate: string;
  endDate: string;
  id?: string;
}

export class HealthProviderReadError extends Error {
  constructor(
    public readonly provider: 'health-connect' | 'apple-health',
    public readonly signal: 'distance' | 'steps' | 'module',
    cause: unknown,
  ) {
    super(
      `${provider} ${signal} read failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'HealthProviderReadError';
  }
}

export function selectAppleHealthDistanceRecords(
  distanceSamples: DailyHealthSample[],
  stepSamples: DailyHealthSample[],
): HealthDistanceRecord[] {
  const totalDistanceMiles = distanceSamples.reduce(
    (sum, sample) => sum + (sample.value || 0),
    0,
  );
  const totalSteps = stepSamples.reduce(
    (sum, sample) => sum + (sample.value || 0),
    0,
  );

  if (stepsToMiles(totalSteps) >= totalDistanceMiles) {
    return stepSamples
      .filter(sample => (sample.value || 0) > 0)
      .map(sample => ({
        id: sample.id || `ah_steps_${sample.startDate}_${sample.endDate}`,
        startTime: sample.startDate,
        endTime: sample.endDate,
        distanceMeters: sample.value * AVERAGE_STRIDE_METERS,
        steps: sample.value,
      }));
  }

  return distanceSamples
    .filter(sample => (sample.value || 0) > 0)
    .map(sample => {
      const rangeStart = new Date(sample.startDate).getTime();
      const rangeEnd = new Date(sample.endDate).getTime();
      const measuredSteps = stepSamples.reduce((sum, stepSample) => {
        const stepStart = new Date(stepSample.startDate).getTime();
        const stepEnd = new Date(stepSample.endDate).getTime();
        return stepStart < rangeEnd && stepEnd > rangeStart
          ? sum + (stepSample.value || 0)
          : sum;
      }, 0);

      return {
        id: sample.id || `ah_${sample.startDate}_${sample.endDate}`,
        startTime: sample.startDate,
        endTime: sample.endDate,
        distanceMeters: milesToMeters(sample.value),
        steps: measuredSteps > 0 ? measuredSteps : milesToSteps(sample.value),
      };
    });
}

export async function getAppleHealthDistanceRecords(
  readDistanceSamples: () => Promise<DailyHealthSample[]>,
  readStepSamples: () => Promise<DailyHealthSample[]>,
): Promise<HealthDistanceRecord[]> {
  let distanceSamples: DailyHealthSample[];
  try {
    distanceSamples = await readDistanceSamples();
  } catch (error) {
    throw new HealthProviderReadError('apple-health', 'distance', error);
  }

  let stepSamples: DailyHealthSample[];
  try {
    stepSamples = await readStepSamples();
  } catch (error) {
    throw new HealthProviderReadError('apple-health', 'steps', error);
  }

  return selectAppleHealthDistanceRecords(distanceSamples, stepSamples);
}

export async function getAggregatedAndroidDistanceRecords(
  hc: HealthConnectAggregator,
  startDate: Date,
  endDate: Date,
): Promise<HealthDistanceRecord[]> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
  };

  // Aggregate reads apply Health Connect's user-selected Activity app
  // priorities, removing overlap between sources such as a phone and a
  // Garmin. Raw readRecords totals do not perform that deduplication.
  let distanceMeters = 0;
  let steps = 0;
  let distanceError: unknown = null;
  let stepsError: unknown = null;

  try {
    const distanceResult = await hc.aggregateRecord({
      recordType: 'Distance',
      timeRangeFilter,
    });
    distanceMeters = distanceResult.DISTANCE?.inMeters || 0;
  } catch (error) {
    distanceError = error;
    const errorMessage = String(error);
    if (
      errorMessage.includes('SecurityException') ||
      errorMessage.includes('permission')
    ) {
      throw error;
    }
  }

  try {
    const stepsResult = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter,
    });
    steps = stepsResult.COUNT_TOTAL || 0;
  } catch (error) {
    stepsError = error;
    const errorMessage = String(error);
    if (
      errorMessage.includes('SecurityException') ||
      errorMessage.includes('permission')
    ) {
      throw error;
    }
  }

  if (distanceError) {
    throw new HealthProviderReadError(
      'health-connect',
      'distance',
      distanceError,
    );
  }
  if (stepsError) {
    throw new HealthProviderReadError('health-connect', 'steps', stepsError);
  }

  const distanceMiles = metersToMiles(distanceMeters);
  const stepsMiles = stepsToMiles(steps);
  const rangeId = startDate.getTime();

  if (stepsMiles >= distanceMiles) {
    return steps > 0
      ? [
          {
            id: `hc_aggregate_${rangeId}`,
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            distanceMeters: steps * AVERAGE_STRIDE_METERS,
            steps,
          },
        ]
      : [];
  }

  return distanceMeters > 0
    ? [
        {
          id: `hc_aggregate_${rangeId}`,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          distanceMeters,
          steps: steps > 0 ? steps : milesToSteps(distanceMiles),
        },
      ]
    : [];
}

export async function getLegacyAndroidDistanceRecords(
  hc: HealthConnectRecordReader,
  startDate: Date,
  endDate: Date,
): Promise<HealthDistanceRecord[]> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
  };
  let distanceRecords: Array<{
    metadata?: { id?: string };
    startTime: string;
    endTime: string;
    distance?: { inMeters?: number };
  }> = [];
  let stepRecords: Array<{
    metadata?: { id?: string };
    startTime: string;
    endTime: string;
    count?: number;
  }> = [];

  try {
    const result = await hc.readRecords('Distance', { timeRangeFilter });
    distanceRecords = result.records as typeof distanceRecords;
  } catch (error) {
    const message = String(error);
    if (
      message.includes('SecurityException') ||
      message.includes('permission')
    ) {
      throw error;
    }
    throw new HealthProviderReadError('health-connect', 'distance', error);
  }

  try {
    const result = await hc.readRecords('Steps', { timeRangeFilter });
    stepRecords = result.records as typeof stepRecords;
  } catch (error) {
    const message = String(error);
    if (
      message.includes('SecurityException') ||
      message.includes('permission')
    ) {
      throw error;
    }
    throw new HealthProviderReadError('health-connect', 'steps', error);
  }

  const totalDistanceMiles = distanceRecords.reduce(
    (sum, record) => sum + metersToMiles(record.distance?.inMeters ?? 0),
    0,
  );
  const totalSteps = stepRecords.reduce(
    (sum, record) => sum + (record.count ?? 0),
    0,
  );

  if (stepsToMiles(totalSteps) >= totalDistanceMiles) {
    return stepRecords
      .filter(record => (record.count ?? 0) > 0)
      .map(record => {
        const steps = record.count ?? 0;
        return {
          id: record.metadata?.id ?? `hc_steps_${record.startTime}`,
          startTime: record.startTime,
          endTime: record.endTime,
          distanceMeters: steps * AVERAGE_STRIDE_METERS,
          steps,
        };
      });
  }

  return distanceRecords
    .filter(record => (record.distance?.inMeters ?? 0) > 0)
    .map(record => {
      const distanceMeters = record.distance?.inMeters ?? 0;
      return {
        id: record.metadata?.id ?? `hc_${record.startTime}`,
        startTime: record.startTime,
        endTime: record.endTime,
        distanceMeters,
        steps: milesToSteps(metersToMiles(distanceMeters)),
      };
    });
}

class FitnessService implements FitnessServiceInterface {
  private isInitialized = false;
  private currentProvider: SyncProvider = 'none';

  /**
   * Check SDK status for Health Connect (Android only)
   * Used by UI to show appropriate install/update prompts
   */
  async checkSdkStatus(): Promise<{
    available: boolean;
    status: 'available' | 'unavailable' | 'update_required';
  }> {
    if (Platform.OS === 'ios') {
      // iOS HealthKit is always available on iOS devices
      return { available: true, status: 'available' };
    }

    try {
      const hc = await getHealthConnectModule();
      if (!hc) {
        return { available: false, status: 'unavailable' };
      }

      const status = await hc.getSdkStatus();

      if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) {
        return { available: true, status: 'available' };
      } else if (
        status ===
        hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
      ) {
        return { available: false, status: 'update_required' };
      } else {
        return { available: false, status: 'unavailable' };
      }
    } catch (error) {
      console.error('[FitnessService] SDK status check error:', error);
      return { available: false, status: 'unavailable' };
    }
  }

  /**
   * Check if Health Connect/HealthKit is available on this device
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        const appleHealth = await getAppleHealthModule();
        if (!appleHealth) {
          return false;
        }
        // Check if HealthKit is available on this device
        return new Promise(resolve => {
          appleHealth.default.isAvailable((err, available) => {
            if (err) {
              resolve(false);
            } else {
              resolve(available);
            }
          });
        });
      } else if (Platform.OS === 'android') {
        const hc = await getHealthConnectModule();
        if (!hc) return false;
        const status = await hc.getSdkStatus();
        return status === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
      }
      return false;
    } catch (error) {
      console.error(
        '[FitnessService] Health service availability check error:',
        error,
      );
      return false;
    }
  }

  /**
   * Initialize the fitness service
   * @param provider The sync provider to use
   */
  async initialize(provider?: SyncProvider): Promise<void> {
    try {
      if (Platform.OS === 'ios') {
        const appleHealth = await getAppleHealthModule();
        if (!appleHealth) {
          console.error(
            '[FitnessService] iOS: Failed to load Apple Health module',
          );
          this.isInitialized = false;
          return;
        }

        this.currentProvider = provider || 'apple-health';

        // Check if HealthKit is available
        const available = await this.isAvailable();
        if (!available) {
          console.warn(
            '[FitnessService] iOS: HealthKit is not available on this device',
          );
          this.isInitialized = false;
          return;
        }

        this.isInitialized = true;
      } else if (Platform.OS === 'android') {
        const selectedProvider = provider || 'health-connect';
        this.currentProvider = selectedProvider;

        if (selectedProvider === 'health-connect') {
          const hc = await getHealthConnectModule();
          if (!hc) {
            console.warn(
              '[FitnessService] Android: Health Connect module not available',
            );
            this.isInitialized = false;
            return;
          }

          // Check if Health Connect is available first
          const available = await this.isAvailable();
          if (!available) {
            console.warn(
              '[FitnessService] Android: Health Connect is not available on this device',
            );
            this.isInitialized = false;
            return;
          }

          const initialized = await hc.initialize();
          if (!initialized) {
            console.warn(
              '[FitnessService] Android: Health Connect initialization returned false',
            );
            this.isInitialized = false;
            return;
          }
          this.isInitialized = true;
        }
      }
    } catch (error) {
      console.error(
        '[FitnessService] Fitness service initialization error:',
        error,
      );
      this.isInitialized = false;
    }
  }

  /**
   * Request permissions to access health data
   * @param provider The sync provider to use
   * @returns true if permissions granted, false otherwise
   */
  async requestPermissions(provider?: SyncProvider): Promise<boolean> {
    try {
      const selectedProvider = provider || this.currentProvider;

      if (Platform.OS === 'ios') {
        const appleHealth = await getAppleHealthModule();
        if (!appleHealth) {
          console.error(
            '[FitnessService] iOS: Apple Health module not available for permissions',
          );
          return false;
        }

        // Define permissions we need - walking/running distance and steps
        const permissions = {
          permissions: {
            read: [
              appleHealth.default.Constants.Permissions.DistanceWalkingRunning,
              appleHealth.default.Constants.Permissions.StepCount,
            ],
            write: [],
          },
        } as Parameters<typeof appleHealth.default.initHealthKit>[0];

        return new Promise(resolve => {
          appleHealth.default.initHealthKit(permissions, (err: string) => {
            if (err) {
              // Note: On iOS, we can't distinguish between "denied" and "not determined"
              // The user may have denied, or it may be the first time asking
              resolve(false);
            } else {
              this.isInitialized = true;
              resolve(true);
            }
          });
        });
      } else if (Platform.OS === 'android') {
        if (selectedProvider === 'health-connect') {
          const hc = await getHealthConnectModule();
          if (!hc) {
            console.warn(
              '[FitnessService] Android: Health Connect module not available',
            );
            return false;
          }

          if (!this.isInitialized) {
            console.warn(
              '[FitnessService] Android: Health Connect not initialized, cannot request permissions',
            );
            return false;
          }
          const permissions = await hc.requestPermission([
            { accessType: 'read', recordType: 'Distance' },
            { accessType: 'read', recordType: 'Steps' },
          ]);
          // Check if at least distance OR steps permission was granted
          const distanceGranted = permissions.some(
            p => p.recordType === 'Distance' && p.accessType === 'read',
          );
          const stepsGranted = permissions.some(
            p => p.recordType === 'Steps' && p.accessType === 'read',
          );
          const granted = distanceGranted || stepsGranted;
          return granted;
        }
      }

      return false;
    } catch (error) {
      console.error('[FitnessService] Permission request error:', error);
      return false;
    }
  }

  /**
   * Disconnect from the health service in-app and reset internal state.
   * Does NOT revoke OS-level permissions —
   * use {@link revokePermissions} for that.
   *
   * The split lets us differentiate "user turned syncing off" (which
   * should leave permissions intact so re-enabling doesn't require
   * another approval flow) from "user wants to revoke access entirely".
   */
  async disconnect(): Promise<void> {
    try {
      this.isInitialized = false;
      this.currentProvider = 'none';
    } catch (error) {
      console.error('[FitnessService] Disconnect error:', error);
    }
  }

  /**
   * Revoke OS-level permissions granted to the app.
   * - Android: calls Health Connect's revokeAllPermissions. Per the
   *   Health Connect API, revocations only take effect after the app
   *   process restarts.
   * - iOS: no-op. HealthKit does not support programmatic revocation;
   *   the user must remove access from Settings → Health → Middle
   *   Earth Challenge.
   */
  async revokePermissions(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        const hc = await getHealthConnectModule();
        if (hc) {
          await hc.revokeAllPermissions();
        }
      }
      // iOS: intentional no-op.
    } catch (error) {
      console.error('[FitnessService] Revoke permissions error:', error);
    }
  }

  /**
   * Whether Health Connect has any of our requested read permissions
   * currently granted. Android-only; returns false on other platforms.
   *
   * Does not prompt the user — safe to call passively (e.g. on mount)
   * to decide whether to surface revoke UI.
   *
   * Note: after {@link revokePermissions}, HC keeps reporting these as
   * granted until the app process restarts (HC API limitation).
   */
  async hasHealthConnectPermissions(): Promise<boolean> {
    return (await this.getHealthConnectPermissionState()) === 'granted';
  }

  /**
   * Passive Health Connect grant check for lifecycle reconciliation.
   * `unknown` means the provider could not be queried, so callers must not
   * interpret it as a revoke or change the user's selected sources.
   */
  async getHealthConnectPermissionState(): Promise<
    'granted' | 'revoked' | 'unknown'
  > {
    if (Platform.OS !== 'android') return 'unknown';
    try {
      const hc = await getHealthConnectModule();
      if (!hc) return 'unknown';
      // initialize() is idempotent and required before querying grants.
      const initialized = await hc.initialize();
      if (!initialized) return 'unknown';
      const granted = await hc.getGrantedPermissions();
      return granted.some(
        p =>
          p.accessType === 'read' &&
          (p.recordType === 'Distance' || p.recordType === 'Steps'),
      )
        ? 'granted'
        : 'revoked';
    } catch (error) {
      console.warn('[FitnessService] getHealthConnectPermissionState:', error);
      return 'unknown';
    }
  }

  /**
   * Per-record-type breakdown of Health Connect read permissions.
   * Powers the status-tagged Required Access list in the Sync modal.
   * Android-only; returns all-false on other platforms.
   */
  async getHealthConnectGrants(): Promise<{
    steps: boolean;
    distance: boolean;
  }> {
    if (Platform.OS !== 'android') return { steps: false, distance: false };
    try {
      const hc = await getHealthConnectModule();
      if (!hc) return { steps: false, distance: false };
      const initialized = await hc.initialize();
      if (!initialized) return { steps: false, distance: false };
      const granted = await hc.getGrantedPermissions();
      const has = (recordType: string) =>
        granted.some(
          p => p.accessType === 'read' && p.recordType === recordType,
        );
      return { steps: has('Steps'), distance: has('Distance') };
    } catch (error) {
      console.warn('[FitnessService] getHealthConnectGrants:', error);
      return { steps: false, distance: false };
    }
  }

  /**
   * Get individual distance records between two dates.
   * @param startDate inclusive start
   * @param endDate exclusive end
   */
  async getDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    if (!this.isInitialized) {
      throw new Error('Fitness service not initialized');
    }

    if (Platform.OS === 'ios') {
      return this.getDistanceRecordsBetweenIOS(startDate, endDate);
    } else if (Platform.OS === 'android') {
      return this.getDistanceRecordsBetweenAndroid(startDate, endDate);
    }

    return [];
  }

  async getLegacyDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    if (!this.isInitialized) {
      throw new Error('Fitness service not initialized');
    }
    if (Platform.OS !== 'android') {
      return this.getDistanceRecordsBetween(startDate, endDate);
    }
    const hc = await getHealthConnectModule();
    if (!hc) return [];
    return getLegacyAndroidDistanceRecords(hc, startDate, endDate);
  }

  /**
   * iOS-specific distance records query
   * Uses daily samples to get individual records with timestamps.
   * Pulls both distance and step samples, and picks whichever signal
   * covers more mileage — same rule as the Android path.
   */
  private async getDistanceRecordsBetweenIOS(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    const appleHealth = await getAppleHealthModule();
    if (!appleHealth) {
      throw new HealthProviderReadError(
        'apple-health',
        'module',
        new Error('Apple Health module not available'),
      );
    }

    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: true,
      // Get daily samples for better granularity
      includeManuallyAdded: true,
    };
    const distanceOptions = {
      ...options,
      // Pin the unit explicitly so HealthKit values match our miles model.
      unit: appleHealth.default.Constants.Units.mile,
    };

    return getAppleHealthDistanceRecords(
      () =>
        new Promise<DailyHealthSample[]>((resolve, reject) => {
          appleHealth.default.getDailyDistanceWalkingRunningSamples(
            distanceOptions,
            (err: string, results: DailyHealthSample[]) => {
              if (err) reject(err);
              else resolve(results || []);
            },
          );
        }),
      () =>
        new Promise<DailyHealthSample[]>((resolve, reject) => {
          appleHealth.default.getDailyStepCountSamples(
            options,
            (err: string, results: DailyHealthSample[]) => {
              if (err) reject(err);
              else resolve(results || []);
            },
          );
        }),
    );
  }

  /**
   * Android-specific distance records query
   */
  private async getDistanceRecordsBetweenAndroid(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    const hc = await getHealthConnectModule();
    if (!hc) {
      throw new HealthProviderReadError(
        'health-connect',
        'module',
        new Error('Health Connect module not available'),
      );
    }
    return getAggregatedAndroidDistanceRecords(hc, startDate, endDate);
  }
}

// Export singleton instance
export const fitnessService = new FitnessService();
export class MockFitnessService implements FitnessServiceInterface {
  private mockDistance = 0;
  /**
   * Synthetic distance records. Each entry is one HealthKit/Health-Connect
   * sample (typically 1-5 minutes wide, fractions of a mile). Real devices
   * produce dozens-to-hundreds of these per active day from background
   * motion tracking, so the mock matches that shape.
   */
  private syntheticHistory: Array<{
    id: string;
    startTime: Date;
    endTime: Date;
    distanceMiles: number;
  }> = [];
  /** Artificial per-call delay (ms). Useful for stall/timeout testing. */
  private artificialDelayMs = 0;
  /** When true, every call rejects with a fake timeout. */
  private simulateTimeout = false;

  /**
   * Seed N days of synthetic distance records ending at `endDate`.
   *
   * `shape` controls per-day record count to mirror real platforms:
   * - `'samples'` (default) — Health Connect on Android: 80-200 small raw
   *   samples per day scattered 7am-10pm, each 1-5 min wide and
   *   0.005-0.05 mi. This is the stress-test shape: thousands of
   *   `addDistanceEntry` calls per chunked sync, exercises dedup hard.
   * - `'daily'` — HealthKit on iOS: 1 aggregated record per day spanning
   *   00:00 → 23:59 with the day's total miles. Trivially handled by the
   *   ingest path; included for shape-completeness, not the stress case.
   *
   * Total daily miles jitters ±20% around `milesPerDay`.
   *
   * IDs are deterministic (`mock_<dayIndex>[_<sampleIndex>]`) so re-running
   * a sync over the same window dedupes correctly.
   */
  seedHistory(
    days: number,
    milesPerDay = 2.5,
    endDate = new Date(),
    shape: 'samples' | 'daily' = 'samples',
  ): void {
    this.syntheticHistory = [];
    // Tiny deterministic PRNG so the same seed produces the same dataset
    // across reloads (helps dedup-on-resume testing).
    let seed = 1337;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(endDate);
      dayStart.setDate(endDate.getDate() - d);
      dayStart.setHours(0, 0, 0, 0);
      const targetMilesToday = milesPerDay * (0.8 + rand() * 0.4);

      if (shape === 'daily') {
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);
        this.syntheticHistory.push({
          id: `mock_d${days - 1 - d}`,
          startTime: dayStart,
          endTime: dayEnd,
          distanceMiles: targetMilesToday,
        });
        continue;
      }

      const samplesToday = 80 + Math.floor(rand() * 120); // 80-200
      const weights: number[] = [];
      let weightSum = 0;
      for (let s = 0; s < samplesToday; s++) {
        const w = 0.2 + rand() * 0.8;
        weights.push(w);
        weightSum += w;
      }

      for (let s = 0; s < samplesToday; s++) {
        const minuteOfDay = 7 * 60 + Math.floor(rand() * 15 * 60);
        const start = new Date(dayStart);
        start.setMinutes(minuteOfDay);
        const durationMin = 1 + Math.floor(rand() * 5);
        const end = new Date(start.getTime() + durationMin * 60 * 1000);
        const miles = (weights[s] / weightSum) * targetMilesToday;
        this.syntheticHistory.push({
          id: `mock_d${days - 1 - d}_s${s}`,
          startTime: start,
          endTime: end,
          distanceMiles: miles,
        });
      }
    }
    this.syntheticHistory.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
  }

  setArtificialDelay(ms: number): void {
    this.artificialDelayMs = Math.max(0, ms);
  }

  setSimulateTimeout(enabled: boolean): void {
    this.simulateTimeout = enabled;
  }

  private async maybeDelay(): Promise<void> {
    if (this.simulateTimeout) {
      // Never resolves; will be raced against the chunk timeout.
      await new Promise(() => {});
    }
    if (this.artificialDelayMs > 0) {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), this.artificialDelayMs),
      );
    }
  }

  async initialize(): Promise<void> {
    // Mock initialized
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock always available
  }

  async checkSdkStatus(): Promise<{
    available: boolean;
    status: 'available' | 'unavailable' | 'update_required';
  }> {
    return { available: true, status: 'available' };
  }

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    this.mockDistance = 0;
  }

  async getDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    await this.maybeDelay();

    if (this.syntheticHistory.length > 0) {
      const records: HealthDistanceRecord[] = [];
      for (const sample of this.syntheticHistory) {
        if (sample.startTime >= startDate && sample.startTime < endDate) {
          records.push({
            id: sample.id,
            startTime: sample.startTime.toISOString(),
            endTime: sample.endTime.toISOString(),
            distanceMeters: sample.distanceMiles * 1609.34,
            steps: milesToSteps(sample.distanceMiles),
          });
        }
      }
      return records;
    }

    // Fallback: single synthetic record from mockDistance accumulator
    const now = endDate.getTime();
    return [
      {
        id: `mock_${now}`,
        startTime: new Date(now - 3600000).toISOString(),
        endTime: new Date(now).toISOString(),
        distanceMeters: this.mockDistance * 1609.34,
        steps: milesToSteps(this.mockDistance),
      },
    ];
  }

  async getLegacyDistanceRecordsBetween(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    return this.getDistanceRecordsBetween(startDate, endDate);
  }

  // Dev helper to manually set distance
  setMockDistance(miles: number): void {
    this.mockDistance = miles;
  }
}

// Export mock for development
export const mockFitnessService = new MockFitnessService();

/**
 * Runtime-swappable accessor used by app code.
 * Defaults to the real implementation; dev tooling can swap to the mock.
 */
let activeFitnessService: FitnessServiceInterface = fitnessService;

export function getActiveFitnessService(): FitnessServiceInterface {
  return activeFitnessService;
}

/**
 * Swap the active fitness service between the real Health Connect / Apple
 * Health provider and the in-memory mock. Guarded by `__DEV__` so release
 * builds are always the real service.
 *
 * Note: this is a plain module-level setter, not a React hook. The name
 * does not start with `use` to avoid tripping react-hooks/rules-of-hooks.
 */
export function setMockFitnessService(enable: boolean): void {
  if (!__DEV__) return; // safety: never swap in release
  activeFitnessService = enable ? mockFitnessService : fitnessService;
}
