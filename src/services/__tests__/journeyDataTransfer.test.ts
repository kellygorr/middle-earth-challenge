const mockExportJson = jest.fn();
const mockImportJson = jest.fn();
const mockExportJourneyBackup = jest.fn();
const mockImportJourneyBackup = jest.fn();
const mockLoadSettings = jest.fn();
const mockSetProgressState = jest.fn();
const mockGetCurrentUserId = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    JourneyDataTransferModule: {
      exportJson: (...args: unknown[]) => mockExportJson(...args),
      importJson: (...args: unknown[]) => mockImportJson(...args),
    },
  },
  Platform: { OS: 'android' },
}));

jest.mock('../database', () => ({
  database: {
    exportJourneyBackup: (sharingUserId: string | null) =>
      mockExportJourneyBackup(sharingUserId),
    importJourneyBackup: (backup: unknown) => mockImportJourneyBackup(backup),
  },
}));

jest.mock('../friendProgressService', () => ({
  friendProgressService: {
    getCurrentUserId: () => mockGetCurrentUserId(),
  },
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ loadSettings: mockLoadSettings }),
  },
}));

jest.mock('../../stores/progressStore', () => ({
  useProgressStore: {
    setState: (updates: unknown) => mockSetProgressState(updates),
  },
}));

import { exportJourneyData, importJourneyData } from '../journeyDataTransfer';

describe('journey data transfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue(null);
  });

  const backup = {
    app: 'MiddleEarthChallenge',
    schemaVersion: 1,
    exportedAt: '2026-09-02T12:00:00.000Z',
    settings: {
      labelSize: 'large',
      textSize: 'medium',
      currentTheme: 'classic',
      showPointLabels: false,
      colorizeMap: true,
      reducedMapTitles: true,
      devMode: false,
      useMiles: true,
      lastNotifiedCheckpointIndex: 4,
    },
    distanceEntries: [
      {
        id: 'manual-1',
        saveId: 'default',
        date: 1,
        miles: 2,
        steps: 4226,
        source: 'manual-distance',
      },
    ],
    troubleshootingIssues: [],
  };

  it('exports a portable JSON backup through the native file picker', async () => {
    mockExportJourneyBackup.mockResolvedValue(backup);
    mockExportJson.mockResolvedValue('content://backup');

    await expect(exportJourneyData()).resolves.toMatch(
      /^challenge-backup-\d{1,2}-\d{1,2}-\d{2}\.json$/,
    );

    expect(mockExportJson).toHaveBeenCalledWith(
      expect.stringMatching(/^challenge-backup-\d{1,2}-\d{1,2}-\d{2}\.json$/),
      JSON.stringify(backup, null, 2),
    );
    expect(mockExportJourneyBackup).toHaveBeenCalledWith(null);
  });

  it('passes the active anonymous user ID into the exported backup', async () => {
    mockGetCurrentUserId.mockResolvedValue('sharing-user');
    mockExportJourneyBackup.mockResolvedValue({
      ...backup,
      schemaVersion: 2,
      sharing: {
        enabled: true,
        userId: 'sharing-user',
        displayName: 'Kelly',
        affinity: 'river',
      },
    });
    mockExportJson.mockResolvedValue('content://backup');

    await exportJourneyData();

    expect(mockExportJourneyBackup).toHaveBeenCalledWith('sharing-user');
  });

  it('imports a valid backup and refreshes in-memory progress', async () => {
    mockImportJson.mockResolvedValue(JSON.stringify(backup));
    mockImportJourneyBackup.mockResolvedValue({ miles: 2, steps: 4226 });

    await expect(importJourneyData()).resolves.toBe(true);

    expect(mockImportJourneyBackup).toHaveBeenCalledWith({
      ...backup,
      distanceEntries: [{ ...backup.distanceEntries[0], saveId: 'default' }],
    });
    expect(mockLoadSettings).toHaveBeenCalledTimes(1);
    expect(mockSetProgressState).toHaveBeenCalledWith({
      miles: 2,
      steps: 4226,
      distanceEntries: [],
      troubleshootingIssues: [],
    });
  });

  it('rejects files that are not Middle Earth Challenge backups', async () => {
    mockImportJson.mockResolvedValue(
      JSON.stringify({ ...backup, app: 'AnotherApp' }),
    );

    await expect(importJourneyData()).rejects.toThrow(
      'not a Middle Earth Challenge backup',
    );
    expect(mockImportJourneyBackup).not.toHaveBeenCalled();
  });

  it('treats cancelled import as a no-op', async () => {
    mockImportJson.mockResolvedValue(null);

    await expect(importJourneyData()).resolves.toBe(false);

    expect(mockImportJourneyBackup).not.toHaveBeenCalled();
    expect(mockLoadSettings).not.toHaveBeenCalled();
  });
});
