const mockDatabaseInit = jest.fn();
const mockLoadSettings = jest.fn();
const mockInitFromDatabase = jest.fn();
const mockIsSupported = jest.fn();
const mockIsServiceRunning = jest.fn();
const mockCommitPedometerRange = jest.fn();
const mockReportBackgroundTaskResult = jest.fn();

const mockSettings = {
  trackingMode: 'pedometer',
  lastSyncTimestamp: 100,
  loadSettings: mockLoadSettings,
};

jest.mock('../database', () => ({
  database: { init: () => mockDatabaseInit() },
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => mockSettings,
  },
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: {
    getState: () => ({ initFromDatabase: mockInitFromDatabase }),
  },
}));

jest.mock('../pedometerService', () => ({
  pedometerService: {
    isSupported: () => mockIsSupported(),
    isServiceRunning: () => mockIsServiceRunning(),
  },
  reportPedometerBackgroundTaskResult: (
    requestId: string,
    succeeded: boolean,
  ) => mockReportBackgroundTaskResult(requestId, succeeded),
}));

jest.mock('../pedometerCommit', () => ({
  commitPedometerRange: (fromMs: number, toMs: number) =>
    mockCommitPedometerRange(fromMs, toMs),
}));

import { pedometerBackgroundTask } from '../pedometerBackgroundTask';

describe('pedometerBackgroundTask', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Date, 'now').mockReturnValue(200);
    Object.assign(mockSettings, {
      trackingMode: 'pedometer',
      lastSyncTimestamp: 100,
    });
    mockDatabaseInit.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue(undefined);
    mockInitFromDatabase.mockResolvedValue(undefined);
    mockIsSupported.mockReturnValue(true);
    mockIsServiceRunning.mockResolvedValue(true);
    mockCommitPedometerRange.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.restoreAllMocks();
  });

  it('reports intentional no-work exits as successful', async () => {
    mockSettings.trackingMode = 'health';

    await pedometerBackgroundTask({ requestId: 'no-work' });

    expect(mockCommitPedometerRange).not.toHaveBeenCalled();
    expect(mockReportBackgroundTaskResult).toHaveBeenCalledWith(
      'no-work',
      true,
    );
  });

  it('reports commit failures as retryable', async () => {
    mockCommitPedometerRange.mockRejectedValue(new Error('disk full'));

    await pedometerBackgroundTask({ requestId: 'commit-failure' });

    expect(mockReportBackgroundTaskResult).toHaveBeenCalledWith(
      'commit-failure',
      false,
    );
  });

  it('reports fatal hydration failures as retryable', async () => {
    mockDatabaseInit.mockRejectedValue(new Error('database unavailable'));

    await pedometerBackgroundTask({ requestId: 'fatal-failure' });

    expect(mockReportBackgroundTaskResult).toHaveBeenCalledWith(
      'fatal-failure',
      false,
    );
  });

  it('reports native bridge failures as retryable', async () => {
    mockIsServiceRunning.mockRejectedValue(new Error('bridge unavailable'));

    await pedometerBackgroundTask({ requestId: 'bridge-failure' });

    expect(mockReportBackgroundTaskResult).toHaveBeenCalledWith(
      'bridge-failure',
      false,
    );
  });
});
