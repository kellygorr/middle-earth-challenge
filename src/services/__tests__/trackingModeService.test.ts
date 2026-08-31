const mockCommitPedometerRange = jest.fn();
const mockUpdateSyncSettings = jest.fn();
const mockStopTracking = jest.fn();
const mockIsServiceRunning = jest.fn();
const mockGetEnvironment = jest.fn();
const mockSetSyncStatus = jest.fn();
const mockResolveSyncIssue = jest.fn();
const mockClearAllSyncIssues = jest.fn();
const mockProgress: {
  syncIssues: Array<{
    error: { kind: string; message?: string };
    at: number;
    dismissedAt: number | null;
  }>;
  setLastSyncDate: jest.Mock;
  resetSyncStatus: jest.Mock;
  clearAllSyncIssues: jest.Mock;
  resolveSyncIssue: jest.Mock;
  setSyncStatus: jest.Mock;
} = {
  syncIssues: [],
  setLastSyncDate: jest.fn(),
  resetSyncStatus: jest.fn(),
  clearAllSyncIssues: mockClearAllSyncIssues,
  resolveSyncIssue: mockResolveSyncIssue,
  setSyncStatus: mockSetSyncStatus,
};
const mockSettings: {
  trackingMode: 'health-app' | 'pedometer' | 'dual';
  lastSyncTimestamp: number | null;
  syncEnabled: boolean;
  syncProvider: 'none' | 'health-connect';
  healthLookbackStartTimestamp: number | null;
  pedometerCleanupPending: boolean;
  updateSyncSettings: typeof mockUpdateSyncSettings;
} = {
  trackingMode: 'pedometer',
  lastSyncTimestamp: 100,
  syncEnabled: true,
  syncProvider: 'none',
  healthLookbackStartTimestamp: null,
  pedometerCleanupPending: false,
  updateSyncSettings: mockUpdateSyncSettings,
};

jest.mock('../pedometerCommit', () => ({
  commitPedometerRange: (fromMs: number, toMs: number) =>
    mockCommitPedometerRange(fromMs, toMs),
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => mockSettings,
  },
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: {
    getState: () => mockProgress,
  },
}));

jest.mock('../pedometerService', () => ({
  pedometerService: {
    isSupported: () => true,
    stopTracking: () => mockStopTracking(),
    isServiceRunning: () => mockIsServiceRunning(),
    getEnvironment: () => mockGetEnvironment(),
  },
}));

import {
  ensureTrackingModeRunning,
  getDualModeInitialCursor,
  getTrackingModeForSources,
  resolveDualPermissionOutcome,
  switchTrackingMode,
} from '../trackingModeService';
import { startOfLocalDay } from '../dualSourceReconciliation';

describe('dual tracking mode transition cursor', () => {
  const noon = new Date(2026, 6, 30, 12).getTime();

  it('reconciles the transition day when Health Connect was active', () => {
    expect(getDualModeInitialCursor('health-app', noon)).toBe(
      startOfLocalDay(noon),
    );
  });

  it('reconciles the current day later when pedometer was already active', () => {
    expect(getDualModeInitialCursor('pedometer', noon)).toBe(
      startOfLocalDay(noon),
    );
  });
});

describe('dual permission fallback', () => {
  it.each([
    [true, 'granted', 'dual'],
    [false, 'granted', 'health-app'],
    [true, 'revoked', 'pedometer'],
    [false, 'revoked', 'none'],
    [true, 'unknown', 'unknown'],
    [false, 'unknown', 'unknown'],
  ] as const)(
    'resolves pedometer=%s health=%s to %s',
    (pedometerAvailable, healthPermission, expected) => {
      expect(
        resolveDualPermissionOutcome(pedometerAvailable, healthPermission),
      ).toBe(expected);
    },
  );
});

describe('source toggle combinations', () => {
  it.each([
    [false, false, null],
    [true, false, 'pedometer'],
    [false, true, 'health-app'],
    [true, true, 'dual'],
  ] as const)(
    'resolves pedometer=%s health=%s to %s',
    (pedometerEnabled, healthEnabled, expected) => {
      expect(getTrackingModeForSources(pedometerEnabled, healthEnabled)).toBe(
        expected,
      );
    },
  );
});

describe('tracking mode pedometer flush boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockSettings, {
      trackingMode: 'pedometer',
      lastSyncTimestamp: 100,
      syncEnabled: true,
      syncProvider: 'none',
      healthLookbackStartTimestamp: null,
      pedometerCleanupPending: false,
    });
    mockUpdateSyncSettings.mockImplementation(async updates => {
      Object.assign(mockSettings, updates);
    });
    mockProgress.syncIssues = [];
    mockProgress.resolveSyncIssue = mockResolveSyncIssue;
    jest.spyOn(Date, 'now').mockReturnValue(200);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves mode and watermark when the pre-switch flush fails', async () => {
    mockCommitPedometerRange.mockRejectedValueOnce(new Error('disk'));

    await expect(switchTrackingMode('health-app')).rejects.toThrow('disk');

    expect(mockCommitPedometerRange).toHaveBeenCalledWith(100, 200);
    expect(mockUpdateSyncSettings).not.toHaveBeenCalled();
    expect(mockStopTracking).not.toHaveBeenCalled();
    expect(mockSettings).toMatchObject({
      trackingMode: 'pedometer',
      lastSyncTimestamp: 100,
    });
  });

  it('anchors health lookback when switching to Health Connect only', async () => {
    mockCommitPedometerRange.mockResolvedValue(undefined);
    mockStopTracking.mockResolvedValue(true);

    await switchTrackingMode('health-app');

    expect(mockUpdateSyncSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trackingMode: 'health-app',
        lastSyncTimestamp: 200,
        healthLookbackStartTimestamp: 200,
      }),
    );
  });

  it('persists failed native cleanup and clears it on foreground retry', async () => {
    const { Platform } = jest.requireActual('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    mockCommitPedometerRange.mockResolvedValue(undefined);
    mockStopTracking
      .mockRejectedValueOnce(new Error('native stop failed'))
      .mockResolvedValueOnce(true);

    const result = await switchTrackingMode('health-app');

    expect(result).toEqual({ mode: 'health-app', tracking: true });
    expect(mockUpdateSyncSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trackingMode: 'health-app',
        pedometerCleanupPending: true,
      }),
    );
    expect(mockSettings.pedometerCleanupPending).toBe(true);

    await ensureTrackingModeRunning();

    expect(mockStopTracking).toHaveBeenCalledTimes(2);
    expect(mockUpdateSyncSettings).toHaveBeenLastCalledWith({
      pedometerCleanupPending: false,
    });
    expect(mockSettings.pedometerCleanupPending).toBe(false);
    Platform.OS = originalOS;
  });

  it('cleans up an unmarked native service when persisted mode is off', async () => {
    const { Platform } = jest.requireActual('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    Object.assign(mockSettings, {
      trackingMode: 'health-app',
      syncEnabled: false,
      pedometerCleanupPending: false,
    });
    mockIsServiceRunning.mockResolvedValueOnce(true);
    mockStopTracking.mockResolvedValueOnce(true);

    await ensureTrackingModeRunning();

    expect(mockUpdateSyncSettings).toHaveBeenNthCalledWith(1, {
      pedometerCleanupPending: true,
    });
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(mockUpdateSyncSettings).toHaveBeenLastCalledWith({
      pedometerCleanupPending: false,
    });
    expect(mockSettings).toMatchObject({
      syncEnabled: false,
      pedometerCleanupPending: false,
    });
    Platform.OS = originalOS;
  });

  it('surfaces native sample failures and clears them after recovery', async () => {
    const { Platform } = jest.requireActual('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    mockGetEnvironment
      .mockResolvedValueOnce({
        activityRecognition: true,
        hasSensor: true,
        ignoresBatteryOptimizations: true,
        samplePersistenceHealthy: false,
        samplePersistenceError: 'disk full',
      })
      .mockResolvedValueOnce({
        activityRecognition: true,
        hasSensor: true,
        ignoresBatteryOptimizations: true,
        samplePersistenceHealthy: true,
        samplePersistenceError: null,
      });
    mockIsServiceRunning.mockResolvedValue(true);

    await ensureTrackingModeRunning();

    expect(mockSetSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'error',
        error: { kind: 'pedometerStorage', message: 'disk full' },
      }),
    );

    mockProgress.syncIssues = [
      {
        error: { kind: 'pedometerStorage', message: 'disk full' },
        at: 1,
        dismissedAt: null,
      },
    ];
    await ensureTrackingModeRunning();

    expect(mockResolveSyncIssue).toHaveBeenCalledWith('pedometer');
    Platform.OS = originalOS;
  });
});
