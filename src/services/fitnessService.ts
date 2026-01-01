import { Platform } from 'react-native';
import {
  initialize as initHealthConnect,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
  revokeAllPermissions,
} from 'react-native-health-connect';
import { HealthData, HealthDistanceRecord, SyncProvider } from '../types';

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
}

class FitnessService implements FitnessServiceInterface {
  private isInitialized = false;
  private currentProvider: SyncProvider = 'none';
  private realTimeCallback: ((distance: number) => void) | null = null;
  private realTimeInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Check if Health Connect is available on this device
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        // TODO: Check iOS HealthKit availability
        return true;
      } else if (Platform.OS === 'android') {
        const status = await getSdkStatus();
        return status === SdkAvailabilityStatus.SDK_AVAILABLE;
      }
      return false;
    } catch (error) {
      console.error('Health service availability check error:', error);
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
        // TODO: Initialize react-native-health
        console.log('iOS HealthKit initialization required');
        this.currentProvider = provider || 'apple-health';
        this.isInitialized = true;
      } else if (Platform.OS === 'android') {
        const selectedProvider = provider || 'health-connect';
        this.currentProvider = selectedProvider;

        if (selectedProvider === 'health-connect') {
          // Check if Health Connect is available first
          const available = await this.isAvailable();
          if (!available) {
            console.warn('Health Connect is not available on this device');
            this.isInitialized = false;
            return;
          }

          const initialized = await initHealthConnect();
          if (!initialized) {
            console.warn('Health Connect initialization returned false');
            this.isInitialized = false;
            return;
          }
          console.log('Android Health Connect initialized');
          this.isInitialized = true;
        }
      }
    } catch (error) {
      console.error('Fitness service initialization error:', error);
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
        // TODO: Request iOS HealthKit permissions
        console.log('iOS permission request required');
        return true; // Mock return for now
      } else if (Platform.OS === 'android') {
        if (selectedProvider === 'health-connect') {
          if (!this.isInitialized) {
            console.warn(
              'Health Connect not initialized, cannot request permissions',
            );
            return false;
          }
          const permissions = await requestPermission([
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
            'Android Health Connect permissions - Distance:',
            distanceGranted,
            'Steps:',
            stepsGranted,
          );
          return granted;
        }
      }

      return false;
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  /**
   * Disconnect from health service and revoke permissions
   * Note: On Android 14+, permissions are not immediately revoked - they will be revoked when the app restarts
   */
  async disconnect(): Promise<void> {
    try {
      this.stopRealTimeUpdates();

      if (Platform.OS === 'android' && this.isInitialized) {
        await revokeAllPermissions();
        console.log('Health Connect permissions revoked');
      } else if (Platform.OS === 'ios') {
        // iOS HealthKit doesn't support programmatic permission revocation
        // User must revoke permissions manually in Settings
        console.log('iOS: User must revoke permissions in Settings');
      }

      this.isInitialized = false;
      this.currentProvider = 'none';
    } catch (error) {
      console.error('Disconnect error:', error);
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
        console.warn('Fitness service not initialized');
        return 0;
      }

      if (Platform.OS === 'ios') {
        // TODO: Query iOS HealthKit for distance
        console.log('iOS distance query required');
        return 0; // Mock return for now
      } else if (Platform.OS === 'android') {
        // Try to get distance data first
        try {
          const distanceResult = await readRecords('Distance', {
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
            console.log('Using distance data:', totalMeters, 'meters');
            return this.metersToMiles(totalMeters);
          }
        } catch {
          console.log('Distance data not available, trying steps fallback');
        }

        // Fallback to steps if no distance data
        try {
          const stepsResult = await readRecords('Steps', {
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
            // Convert steps to miles (approximately 2,000 steps per mile)
            const miles = this.stepsToMiles(totalSteps);
            console.log(
              'Using steps fallback:',
              totalSteps,
              'steps =',
              miles,
              'miles',
            );
            return miles;
          }
        } catch {
          console.log('Steps data also not available');
        }

        return 0;
      }

      return 0;
    } catch (error) {
      console.error('Get distance error:', error);
      return 0;
    }
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
        console.warn('Fitness service not initialized');
        return [];
      }

      if (Platform.OS === 'ios') {
        // TODO: Query iOS HealthKit for distance records
        console.log('iOS distance records query required');
        return [];
      } else if (Platform.OS === 'android') {
        try {
          const distanceResult = await readRecords('Distance', {
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
            'Got',
            records.length,
            'distance records from Health Connect',
          );
          return records;
        } catch (error) {
          console.log('Failed to get distance records:', error);
          return [];
        }
      }

      return [];
    } catch (error) {
      console.error('Get distance records error:', error);
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
        console.warn('Fitness service not initialized');
        return [];
      }

      // TODO: Implement platform-specific queries
      // This should aggregate data by day and return an array
      // For now, return empty array
      console.log('Health data range query required');
      return [];
    } catch (error) {
      console.error('Get health data range error:', error);
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
   * Convert steps to miles (approximately 2,000 steps per mile)
   */
  private stepsToMiles(steps: number): number {
    return steps / 2000;
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
