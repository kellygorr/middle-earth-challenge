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

  it('clears the cursor when dual tracking is disabled', () => {
    useSettingsStore.getState().setSyncEnabled(false);

    expect(useSettingsStore.getState().lastHealthReconciledThrough).toBeNull();
    expect(updateUserSettings).toHaveBeenCalledWith({
      syncEnabled: false,
      lastHealthReconciledThrough: null,
    });
  });

  it('does not change the cursor when a single source is disabled', () => {
    useSettingsStore.setState({ trackingMode: 'health-app' });

    useSettingsStore.getState().setSyncEnabled(false);

    expect(useSettingsStore.getState().lastHealthReconciledThrough).toBe(1234);
    expect(updateUserSettings).toHaveBeenCalledWith({ syncEnabled: false });
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
      sharingDeletionPending: false,
      lastPublishedMiles: null,
      lastSharedProgressSyncAt: null,
    });
  });

  it('persists sharing state and publication metadata', () => {
    const settings = useSettingsStore.getState();

    settings.setSharingEnabled(true);
    settings.setSharingDisplayName('Kelly');
    settings.setSharingAffinity('river');
    settings.setSharingDeletionPending(true);
    settings.setLastPublishedMiles(12.5);
    settings.setLastSharedProgressSyncAt(1234);

    expect(useSettingsStore.getState()).toMatchObject({
      sharingEnabled: true,
      sharingDisplayName: 'Kelly',
      sharingAffinity: 'river',
      sharingDeletionPending: true,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: 1234,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(1, {
      sharingEnabled: true,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(2, {
      sharingDisplayName: 'Kelly',
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(3, {
      sharingAffinity: 'river',
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(4, {
      sharingDeletionPending: true,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(5, {
      lastPublishedMiles: 12.5,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(6, {
      lastSharedProgressSyncAt: 1234,
    });
  });

  it('persists cleared optional sharing values as null', () => {
    useSettingsStore.getState().setSharingDisplayName(null);
    useSettingsStore.getState().setSharingAffinity(null);
    useSettingsStore.getState().setLastPublishedMiles(null);
    useSettingsStore.getState().setLastSharedProgressSyncAt(null);

    expect(updateUserSettings).toHaveBeenNthCalledWith(1, {
      sharingDisplayName: null,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(2, {
      sharingAffinity: null,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(3, {
      lastPublishedMiles: null,
    });
    expect(updateUserSettings).toHaveBeenNthCalledWith(4, {
      lastSharedProgressSyncAt: null,
    });
  });
});
