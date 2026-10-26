import { useSettingsStore } from '../settingsStore';
import { database } from '../../services/database';

describe('settingsStore dual reconciliation cursor', () => {
  const updateUserSettings = jest
    .spyOn(database, 'updateUserSettings')
    .mockResolvedValue();

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({
      trackingMode: 'dual',
      syncEnabled: true,
      lastHealthReconciledThrough: 1234,
    });
  });

  it('does not hide a cursor write inside an operational update', async () => {
    await useSettingsStore.getState().updateSyncSettings({
      syncEnabled: false,
    });

    expect(useSettingsStore.getState().lastHealthReconciledThrough).toBe(1234);
    expect(updateUserSettings).toHaveBeenCalledWith({ syncEnabled: false });
  });

  it('does not change the cursor when a single source is disabled', async () => {
    useSettingsStore.setState({ trackingMode: 'health-app' });

    await useSettingsStore.getState().updateSyncSettings({
      syncEnabled: false,
    });

    expect(useSettingsStore.getState().lastHealthReconciledThrough).toBe(1234);
    expect(updateUserSettings).toHaveBeenCalledWith({ syncEnabled: false });
  });

  it('publishes batched bookmarks after persistence succeeds', async () => {
    useSettingsStore.setState({
      syncStartDate: 100,
      lastSyncTimestamp: 200,
      lastHealthReconciledThrough: 300,
    });

    await useSettingsStore.getState().updateSyncBookmarks({
      syncStartDate: 400,
      lastSyncTimestamp: null,
      lastHealthReconciledThrough: null,
    });

    expect(updateUserSettings).toHaveBeenCalledWith({
      syncStartDate: 400,
      lastSyncTimestamp: null,
      lastHealthReconciledThrough: null,
    });
    expect(useSettingsStore.getState()).toMatchObject({
      syncStartDate: 400,
      lastSyncTimestamp: null,
      lastHealthReconciledThrough: null,
    });
  });

  it('does not publish bookmarks when persistence fails', async () => {
    useSettingsStore.setState({
      syncStartDate: 100,
      lastSyncTimestamp: 200,
      lastHealthReconciledThrough: 300,
    });
    updateUserSettings.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      useSettingsStore.getState().updateSyncBookmarks({
        syncStartDate: 400,
        lastSyncTimestamp: null,
        lastHealthReconciledThrough: null,
      }),
    ).rejects.toThrow('database unavailable');

    expect(useSettingsStore.getState()).toMatchObject({
      syncStartDate: 100,
      lastSyncTimestamp: 200,
      lastHealthReconciledThrough: 300,
    });
  });

  it('persists native cleanup state before publishing it', async () => {
    useSettingsStore.setState({ pedometerCleanupPending: false });
    let finishWrite: (() => void) | undefined;
    updateUserSettings.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishWrite = resolve;
        }),
    );

    const update = useSettingsStore.getState().updateSyncSettings({
      syncEnabled: false,
      pedometerCleanupPending: true,
    });

    expect(useSettingsStore.getState()).toMatchObject({
      syncEnabled: true,
      pedometerCleanupPending: false,
    });
    finishWrite?.();
    await update;

    expect(updateUserSettings).toHaveBeenCalledWith({
      syncEnabled: false,
      pedometerCleanupPending: true,
    });
    expect(useSettingsStore.getState()).toMatchObject({
      syncEnabled: false,
      pedometerCleanupPending: true,
    });
  });
});

describe('settingsStore shared progress', () => {
  const updateUserSettings = jest
    .spyOn(database, 'updateUserSettings')
    .mockResolvedValue();

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({
      sharingEnabled: false,
      sharingDisplayName: null,
      sharingAffinity: null,
      sharingProvisioningPending: false,
      sharingDeletionPending: false,
      lastPublishedMiles: null,
      lastSharedProgressSyncAt: null,
    });
  });

  it('persists sharing state in one batch before publishing it', async () => {
    const settings = useSettingsStore.getState();
    let finishWrite: (() => void) | undefined;
    updateUserSettings.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishWrite = resolve;
        }),
    );

    const update = settings.updateSharingSettings({
      sharingEnabled: true,
      sharingDisplayName: 'Kelly',
      sharingAffinity: 'river',
      sharingProvisioningPending: false,
      sharingDeletionPending: false,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: 1234,
    });

    expect(useSettingsStore.getState().sharingEnabled).toBe(false);
    finishWrite?.();
    await update;

    expect(useSettingsStore.getState()).toMatchObject({
      sharingEnabled: true,
      sharingDisplayName: 'Kelly',
      sharingAffinity: 'river',
      sharingProvisioningPending: false,
      sharingDeletionPending: false,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: 1234,
    });
    expect(updateUserSettings).toHaveBeenCalledWith({
      sharingEnabled: true,
      sharingDisplayName: 'Kelly',
      sharingAffinity: 'river',
      sharingProvisioningPending: false,
      sharingDeletionPending: false,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: 1234,
    });
  });

  it('does not publish sharing state when persistence fails', async () => {
    updateUserSettings.mockRejectedValueOnce(new Error('disk'));

    await expect(
      useSettingsStore.getState().updateSharingSettings({
        sharingEnabled: true,
        sharingProvisioningPending: true,
      }),
    ).rejects.toThrow('disk');

    expect(useSettingsStore.getState()).toMatchObject({
      sharingEnabled: false,
      sharingProvisioningPending: false,
    });
  });
});
