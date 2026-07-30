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
