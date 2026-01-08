import { Platform } from 'react-native';
import { HealthData, HealthDistanceRecord, SyncProvider } from '../types';

// Average stride length in meters (approximately 0.762m or 2.5 feet)
const AVERAGE_STRIDE_METERS = 0.762;

/**
 * Fitness service abstraction layer
 * Handles health data from Apple Health (iOS) and Health Connect (Android)
 */

export interface FitnessServiceInterface {
  initialize(provider?: SyncProvider): Promise<void>;
  requestPermissions(provider?: SyncProvider): Promise<boolean>;
  disconnect(): Promise<void>;
  getDistanceToday(): Promise<number>;
  getDistanceSince(startDate: Date): Promise<number>;
  getDistanceRecordsSince(startDate: Date): Promise<HealthDistanceRecord[]>;
  getHealthDataForDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<HealthData[]>;
  startRealTimeUpdates(callback: (distance: number) => void): void;
  stopRealTimeUpdates(): void;
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

class FitnessService implements FitnessServiceInterface {
  private isInitialized = false;
  private currentProvider: SyncProvider = 'none';
  private realTimeCallback: ((distance: number) => void) | null = null;
  private realTimeInterval: ReturnType<typeof setInterval> | null = null;

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
      console.log('[FitnessService] Health Connect SDK status:', status);

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
          console.log(
            '[FitnessService] iOS: Apple Health module not available',
          );
          return false;
        }
        // Check if HealthKit is available on this device
        return new Promise(resolve => {
          appleHealth.default.isAvailable((err, available) => {
            if (err) {
              console.log(
                '[FitnessService] iOS: HealthKit availability check error:',
                err,
              );
              resolve(false);
            } else {
              console.log(
                '[FitnessService] iOS: HealthKit available:',
                available,
              );
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

        console.log('[FitnessService] iOS: HealthKit initialized');
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
          console.log('[FitnessService] Android: Health Connect initialized');
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

        console.log(
          '[FitnessService] iOS: Requesting HealthKit permissions...',
        );

        return new Promise(resolve => {
          appleHealth.default.initHealthKit(permissions, (err: string) => {
            if (err) {
              console.log(
                '[FitnessService] iOS: Permission request error:',
                err,
              );
              // Note: On iOS, we can't distinguish between "denied" and "not determined"
              // The user may have denied, or it may be the first time asking
              resolve(false);
            } else {
              console.log(
                '[FitnessService] iOS: HealthKit permissions granted',
              );
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
          console.log(
            '[FitnessService] Android: Health Connect permissions - Distance:',
            distanceGranted,
            'Steps:',
            stepsGranted,
          );
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
   * Disconnect from health service and revoke permissions
   * Note: On Android 14+, permissions are not immediately revoked - they will be revoked when the app restarts
   * Note: On iOS, permissions cannot be revoked programmatically - user must go to Settings
   */
  async disconnect(): Promise<void> {
    try {
      this.stopRealTimeUpdates();

      if (Platform.OS === 'android' && this.isInitialized) {
        const hc = await getHealthConnectModule();
        if (hc) {
          await hc.revokeAllPermissions();
          console.log(
            '[FitnessService] Android: Health Connect permissions revoked',
          );
        }
      } else if (Platform.OS === 'ios') {
        // iOS HealthKit doesn't support programmatic permission revocation
        // User must revoke permissions manually in Settings → Health → Middle Earth Challenge
        console.log(
          '[FitnessService] iOS: User must revoke permissions in Settings → Health → Middle Earth Challenge',
        );
      }

      this.isInitialized = false;
      this.currentProvider = 'none';
    } catch (error) {
      console.error('[FitnessService] Disconnect error:', error);
    }
  }

  /**
   * Get total distance walked/run today (in miles)
   */
  async getDistanceToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.getDistanceSince(today);
  }

  /**
   * Get total distance walked/run since a specific date (in miles)
   * @param startDate Start date for distance calculation
   */
  async getDistanceSince(startDate: Date): Promise<number> {
    try {
      if (!this.isInitialized) {
        console.warn('[FitnessService] Fitness service not initialized');
        return 0;
      }

      if (Platform.OS === 'ios') {
        return await this.getDistanceSinceIOS(startDate);
      } else if (Platform.OS === 'android') {
        return await this.getDistanceSinceAndroid(startDate);
      }

      return 0;
    } catch (error) {
      console.error('[FitnessService] Get distance error:', error);
      return 0;
    }
  }

  /**
   * iOS-specific distance query
   */
  private async getDistanceSinceIOS(startDate: Date): Promise<number> {
    const appleHealth = await getAppleHealthModule();
    if (!appleHealth) {
      console.error('[FitnessService] iOS: Apple Health module not available');
      return 0;
    }

    const options = {
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString(),
    };

    // Try to get walking/running distance first
    try {
      const distance = await new Promise<number>((resolve, reject) => {
        appleHealth.default.getDistanceWalkingRunning(
          options,
          (err: string, results: { value: number }) => {
            if (err) {
              console.log('[FitnessService] iOS: Distance query error:', err);
              reject(err);
            } else {
              // Distance is returned in miles
              console.log(
                '[FitnessService] iOS: Got distance:',
                results?.value,
                'miles',
              );
              resolve(results?.value || 0);
            }
          },
        );
      });

      if (distance > 0) {
        return distance;
      }
    } catch {
      console.log(
        '[FitnessService] iOS: Distance not available, trying steps fallback',
      );
    }

    // Fallback to steps if no distance data
    try {
      const steps = await new Promise<number>((resolve, reject) => {
        appleHealth.default.getStepCount(
          options,
          (err: string, results: { value: number }) => {
            if (err) {
              console.log('[FitnessService] iOS: Steps query error:', err);
              reject(err);
            } else {
              console.log('[FitnessService] iOS: Got steps:', results?.value);
              resolve(results?.value || 0);
            }
          },
        );
      });

      if (steps > 0) {
        const miles = this.stepsToMiles(steps);
        console.log(
          '[FitnessService] iOS: Steps fallback:',
          steps,
          'steps =',
          miles,
          'miles',
        );
        return miles;
      }
    } catch {
      console.log('[FitnessService] iOS: Steps also not available');
    }

    return 0;
  }

  /**
   * Android-specific distance query
   */
  private async getDistanceSinceAndroid(startDate: Date): Promise<number> {
    const hc = await getHealthConnectModule();
    if (!hc) return 0;

    // Try to get distance data first
    try {
      const distanceResult = await hc.readRecords('Distance', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: new Date().toISOString(),
        },
      });
      const totalMeters = distanceResult.records.reduce(
        (sum, record) => sum + (record.distance?.inMeters || 0),
        0,
      );
      if (totalMeters > 0) {
        console.log(
          '[FitnessService] Android: Using distance data:',
          totalMeters,
          'meters',
        );
        return this.metersToMiles(totalMeters);
      }
    } catch {
      console.log(
        '[FitnessService] Android: Distance data not available, trying steps fallback',
      );
    }

    // Fallback to steps if no distance data
    try {
      const stepsResult = await hc.readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: new Date().toISOString(),
        },
      });
      const totalSteps = stepsResult.records.reduce(
        (sum, record) => sum + (record.count || 0),
        0,
      );
      if (totalSteps > 0) {
        const miles = this.stepsToMiles(totalSteps);
        console.log(
          '[FitnessService] Android: Using steps fallback:',
          totalSteps,
          'steps =',
          miles,
          'miles',
        );
        return miles;
      }
    } catch {
      console.log('[FitnessService] Android: Steps data also not available');
    }

    return 0;
  }

  /**
   * Get individual distance records since a specific date
   * Returns an array of records with timestamps for storing as individual entries
   * @param startDate Start date for distance calculation
   */
  async getDistanceRecordsSince(
    startDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    try {
      if (!this.isInitialized) {
        console.warn('[FitnessService] Fitness service not initialized');
        return [];
      }

      if (Platform.OS === 'ios') {
        return await this.getDistanceRecordsSinceIOS(startDate);
      } else if (Platform.OS === 'android') {
        return await this.getDistanceRecordsSinceAndroid(startDate);
      }

      return [];
    } catch (error) {
      console.error('[FitnessService] Get distance records error:', error);
      // Re-throw permission errors so they can be handled by the caller
      const errorMessage = String(error);
      if (
        errorMessage.includes('SecurityException') ||
        errorMessage.includes('permission')
      ) {
        throw error;
      }
      return [];
    }
  }

  /**
   * iOS-specific distance records query
   * Uses daily samples to get individual records with timestamps
   */
  private async getDistanceRecordsSinceIOS(
    startDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    const appleHealth = await getAppleHealthModule();
    if (!appleHealth) {
      console.error('[FitnessService] iOS: Apple Health module not available');
      return [];
    }

    const options = {
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString(),
      ascending: true,
      // Get daily samples for better granularity
      includeManuallyAdded: true,
    };

    const records: HealthDistanceRecord[] = [];

    // Try to get walking/running distance samples
    try {
      const distanceSamples = await new Promise<
        Array<{
          value: number;
          startDate: string;
          endDate: string;
          id?: string;
        }>
      >((resolve, reject) => {
        appleHealth.default.getDailyDistanceWalkingRunningSamples(
          options,
          (
            err: string,
            results: Array<{
              value: number;
              startDate: string;
              endDate: string;
              id?: string;
            }>,
          ) => {
            if (err) {
              console.log(
                '[FitnessService] iOS: Distance samples query error:',
                err,
              );
              reject(err);
            } else {
              console.log(
                '[FitnessService] iOS: Got',
                results?.length || 0,
                'distance samples',
              );
              resolve(results || []);
            }
          },
        );
      });

      for (const sample of distanceSamples) {
        if (sample.value > 0) {
          records.push({
            // Use ah_ prefix for Apple Health records to distinguish from Health Connect
            id: sample.id || `ah_${sample.startDate}_${sample.endDate}`,
            startTime: sample.startDate,
            endTime: sample.endDate,
            // Apple Health returns distance in miles, convert to meters for consistency
            distanceMeters: this.milesToMeters(sample.value),
          });
        }
      }

      if (records.length > 0) {
        console.log(
          '[FitnessService] iOS: Returning',
          records.length,
          'distance records',
        );
        return records;
      }
    } catch {
      console.log(
        '[FitnessService] iOS: Distance samples not available, trying steps fallback',
      );
    }

    // Fallback to step samples if no distance data
    try {
      const stepSamples = await new Promise<
        Array<{
          value: number;
          startDate: string;
          endDate: string;
          id?: string;
        }>
      >((resolve, reject) => {
        appleHealth.default.getDailyStepCountSamples(
          options,
          (
            err: string,
            results: Array<{
              value: number;
              startDate: string;
              endDate: string;
              id?: string;
            }>,
          ) => {
            if (err) {
              console.log(
                '[FitnessService] iOS: Step samples query error:',
                err,
              );
              reject(err);
            } else {
              console.log(
                '[FitnessService] iOS: Got',
                results?.length || 0,
                'step samples',
              );
              resolve(results || []);
            }
          },
        );
      });

      for (const sample of stepSamples) {
        if (sample.value > 0) {
          // Convert steps to distance using average stride length
          const distanceMeters = sample.value * AVERAGE_STRIDE_METERS;
          records.push({
            id: sample.id || `ah_steps_${sample.startDate}_${sample.endDate}`,
            startTime: sample.startDate,
            endTime: sample.endDate,
            distanceMeters,
          });
        }
      }

      console.log(
        '[FitnessService] iOS: Returning',
        records.length,
        'step-based records',
      );
    } catch {
      console.log('[FitnessService] iOS: Step samples also not available');
    }

    return records;
  }

  /**
   * Android-specific distance records query
   */
  private async getDistanceRecordsSinceAndroid(
    startDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    const hc = await getHealthConnectModule();
    if (!hc) return [];

    try {
      const distanceResult = await hc.readRecords('Distance', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: new Date().toISOString(),
        },
      });

      const records: HealthDistanceRecord[] = distanceResult.records.map(
        record => ({
          id: record.metadata?.id || `hc_${record.startTime}`,
          startTime: record.startTime,
          endTime: record.endTime,
          distanceMeters: record.distance?.inMeters || 0,
        }),
      );

      console.log(
        '[FitnessService] Android: Got',
        records.length,
        'distance records from Health Connect',
      );
      return records;
    } catch (error) {
      console.log(
        '[FitnessService] Android: Failed to get distance records:',
        error,
      );
      // Re-throw permission errors so they can be handled by the caller
      const errorMessage = String(error);
      if (
        errorMessage.includes('SecurityException') ||
        errorMessage.includes('permission')
      ) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Get health data for a specific date range
   * @param startDate Start date
   * @param endDate End date
   * @returns Array of daily health data
   */
  async getHealthDataForDateRange(
    _startDate: Date,
    _endDate: Date,
  ): Promise<HealthData[]> {
    try {
      if (!this.isInitialized) {
        console.warn('[FitnessService] Fitness service not initialized');
        return [];
      }

      // TODO: Implement platform-specific queries
      // This should aggregate data by day and return an array
      // For now, return empty array
      console.log('[FitnessService] Health data range query required');
      return [];
    } catch (error) {
      console.error('[FitnessService] Get health data range error:', error);
      return [];
    }
  }

  /**
   * Start real-time distance updates
   * Useful for tracking progress during active workouts
   * @param callback Function to call with updated distance
   */
  startRealTimeUpdates(callback: (distance: number) => void): void {
    this.realTimeCallback = callback;

    // Poll for updates every 10 seconds
    this.realTimeInterval = setInterval(async () => {
      if (this.realTimeCallback) {
        const distance = await this.getDistanceToday();
        this.realTimeCallback(distance);
      }
    }, 10000); // 10 seconds
  }

  /**
   * Stop real-time distance updates
   */
  stopRealTimeUpdates(): void {
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
      this.realTimeInterval = null;
    }
    this.realTimeCallback = null;
  }

  /**
   * Convert meters to miles
   */
  private metersToMiles(meters: number): number {
    return meters * 0.000621371;
  }

  /**
   * Convert steps to miles using average stride length
   */
  private stepsToMiles(steps: number): number {
    // Convert steps to meters using average stride, then to miles
    const meters = steps * AVERAGE_STRIDE_METERS;
    return this.metersToMiles(meters);
  }

  /**
   * Convert miles to meters
   */
  private milesToMeters(miles: number): number {
    return miles / 0.000621371;
  }
}

// Export singleton instance
export const fitnessService = new FitnessService();

/**
 * Mock fitness service for development/testing
 * Simulates gradual distance accumulation
 */
export class MockFitnessService implements FitnessServiceInterface {
  private mockDistance = 0;
  private mockInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    console.log('Mock fitness service initialized');
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
    console.log('Mock permissions granted');
    return true;
  }

  async disconnect(): Promise<void> {
    console.log('Mock fitness service disconnected');
    this.stopRealTimeUpdates();
    this.mockDistance = 0;
  }

  async getDistanceToday(): Promise<number> {
    return this.mockDistance;
  }

  async getDistanceSince(startDate: Date): Promise<number> {
    // Simulate some distance based on time elapsed
    const daysElapsed = Math.floor(
      (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.min(daysElapsed * 2.5, this.mockDistance); // 2.5 miles per day
  }

  async getDistanceRecordsSince(
    _startDate: Date,
  ): Promise<HealthDistanceRecord[]> {
    // Return mock records
    const now = Date.now();
    return [
      {
        id: `mock_${now}`,
        startTime: new Date(now - 3600000).toISOString(), // 1 hour ago
        endTime: new Date(now).toISOString(),
        distanceMeters: this.mockDistance * 1609.34, // Convert miles to meters
      },
    ];
  }

  async getHealthDataForDateRange(
    _startDate: Date,
    _endDate: Date,
  ): Promise<HealthData[]> {
    const data: HealthData[] = [];
    const current = new Date(_startDate);

    while (current <= _endDate) {
      data.push({
        distance: Math.random() * 5, // Random 0-5 miles per day
        steps: Math.floor(Math.random() * 10000),
        date: current.toISOString().split('T')[0],
      });
      current.setDate(current.getDate() + 1);
    }

    return data;
  }

  startRealTimeUpdates(callback: (distance: number) => void): void {
    this.mockInterval = setInterval(() => {
      this.mockDistance += 0.1; // Add 0.1 mile every interval
      callback(this.mockDistance);
    }, 5000); // Every 5 seconds
  }

  stopRealTimeUpdates(): void {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  // Dev helper to manually set distance
  setMockDistance(miles: number): void {
    this.mockDistance = miles;
  }
}

// Export mock for development
export const mockFitnessService = new MockFitnessService();
