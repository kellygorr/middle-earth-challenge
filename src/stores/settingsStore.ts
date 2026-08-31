import { create } from 'zustand';
import { UserSettings, LabelSize, TextSize } from '../types';
import { ThemeName, themes } from '../styles/themes';
import { database } from '../services/database';
import { useProgressStore } from './progressStore';
import { DEFAULT_SAVE_ID } from '../constants/gameConstants';

interface SettingsStore extends UserSettings {
  showWelcome: boolean;
  isLoaded: boolean;
  // Actions
  setLabelSize: (size: LabelSize) => void;
  setTextSize: (size: TextSize) => void;
  setTheme: (theme: ThemeName) => void;
  setShowPointLabels: (show: boolean) => void;
  setColorizeMap: (colorize: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  setReducedMapTitles: (reduced: boolean) => void;
  setDevMode: (enabled: boolean) => void;
  setUseMiles: (useMiles: boolean) => void;
  // Sync actions
  updateSyncBookmarks: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'syncStartDate'
        | 'lastSyncTimestamp'
        | 'pedometerCursor'
        | 'lastHealthReconciledThrough'
      >
    >,
  ) => Promise<void>;
  updateSyncSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'syncEnabled'
        | 'syncProvider'
        | 'syncStartDate'
        | 'lastSyncTimestamp'
        | 'pedometerCursor'
        | 'healthSyncFormatVersion'
        | 'healthLookbackStartTimestamp'
        | 'lastHealthReconciledThrough'
        | 'liveSyncEnabled'
        | 'trackingMode'
        | 'hasSeenOemBatteryPrompt'
        | 'hcRevokePendingRestart'
        | 'pedometerCleanupPending'
        | 'lastNotifiedCheckpointIndex'
      >
    >,
  ) => Promise<void>;
  setLiveSyncEnabled: (enabled: boolean) => void;
  updateSharingSettings: (
    updates: Partial<
      Pick<
        UserSettings,
        | 'sharingEnabled'
        | 'sharingDisplayName'
        | 'sharingAffinity'
        | 'sharingProvisioningPending'
        | 'sharingDeletionPending'
        | 'lastPublishedMiles'
        | 'lastSharedProgressSyncAt'
      >
    >,
  ) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>(set => ({
  // Initial state
  id: DEFAULT_SAVE_ID,
  labelSize: 'medium',
  textSize: 'medium',
  currentTheme: 'minimalist',
  showPointLabels: true,
  colorizeMap: true,
  showWelcome: true,
  reducedMapTitles: true,
  devMode: false,
  useMiles: true,
  isLoaded: false,
  // Sync settings
  syncEnabled: false,
  syncProvider: 'none',
  syncStartDate: null,
  lastSyncTimestamp: null,
  pedometerCursor: null,
  healthSyncFormatVersion: 0,
  healthLookbackStartTimestamp: null,
  lastHealthReconciledThrough: null,
  liveSyncEnabled: false,
  trackingMode: 'health-app',
  hasSeenOemBatteryPrompt: false,
  hcRevokePendingRestart: false,
  pedometerCleanupPending: false,
  lastNotifiedCheckpointIndex: -1,
  sharingEnabled: false,
  sharingDisplayName: null,
  sharingAffinity: null,
  sharingProvisioningPending: false,
  sharingDeletionPending: false,
  lastPublishedMiles: null,
  lastSharedProgressSyncAt: null,

  // Actions - each setter also persists to database
  setLabelSize: size => {
    set({ labelSize: size });
    database.updateUserSettings({ labelSize: size });
  },

  setTextSize: size => {
    set({ textSize: size });
    database.updateUserSettings({ textSize: size });
  },

  setTheme: theme => {
    set({ currentTheme: theme });
    database.updateUserSettings({ currentTheme: theme });
  },

  setShowPointLabels: show => {
    set({ showPointLabels: show });
    database.updateUserSettings({ showPointLabels: show });
  },

  setColorizeMap: colorize => {
    set({ colorizeMap: colorize });
    database.updateUserSettings({ colorizeMap: colorize });
  },

  setShowWelcome: show => {
    set({ showWelcome: show });
  }, // Not persisted - always shows on load

  setReducedMapTitles: reduced => {
    set({ reducedMapTitles: reduced });
    database.updateUserSettings({ reducedMapTitles: reduced });
  },

  setDevMode: enabled => {
    set({ devMode: enabled });
    database.updateUserSettings({ devMode: enabled });
    // When disabling dev mode, restore the real miles
    if (!enabled) {
      useProgressStore.getState().clearTestOverride();
    }
  },

  setUseMiles: useMiles => {
    set({ useMiles });
    database.updateUserSettings({ useMiles });
  },

  // Sync actions
  updateSyncBookmarks: async updates => {
    await database.updateUserSettings(updates);
    set(updates);
  },

  updateSyncSettings: async updates => {
    await database.updateUserSettings(updates);
    set(updates);
  },

  setLiveSyncEnabled: enabled => {
    set({ liveSyncEnabled: enabled });
    database.updateUserSettings({ liveSyncEnabled: enabled });
  },

  updateSharingSettings: async updates => {
    await database.updateUserSettings(updates);
    set(updates);
  },

  loadSettings: async () => {
    const settings = await database.getUserSettings();
    set({
      id: settings.id,
      labelSize: settings.labelSize,
      textSize: settings.textSize,
      currentTheme: settings.currentTheme,
      showPointLabels: settings.showPointLabels,
      colorizeMap: settings.colorizeMap,
      reducedMapTitles: settings.reducedMapTitles,
      devMode:
        settings.devMode === undefined || settings.devMode === null
          ? true
          : settings.devMode,
      useMiles: settings.useMiles ?? true,
      syncEnabled: settings.syncEnabled ?? false,
      syncProvider: settings.syncProvider ?? 'none',
      syncStartDate: settings.syncStartDate ?? null,
      lastSyncTimestamp: settings.lastSyncTimestamp ?? null,
      pedometerCursor: settings.pedometerCursor ?? null,
      healthSyncFormatVersion: settings.healthSyncFormatVersion ?? 0,
      healthLookbackStartTimestamp:
        settings.healthLookbackStartTimestamp ?? null,
      lastHealthReconciledThrough: settings.lastHealthReconciledThrough ?? null,
      liveSyncEnabled: settings.liveSyncEnabled ?? false,
      trackingMode: settings.trackingMode ?? 'health-app',
      hasSeenOemBatteryPrompt: settings.hasSeenOemBatteryPrompt ?? false,
      hcRevokePendingRestart: settings.hcRevokePendingRestart ?? false,
      pedometerCleanupPending: settings.pedometerCleanupPending ?? false,
      lastNotifiedCheckpointIndex: settings.lastNotifiedCheckpointIndex ?? -1,
      sharingEnabled: settings.sharingEnabled ?? false,
      sharingDisplayName: settings.sharingDisplayName ?? null,
      sharingAffinity: settings.sharingAffinity ?? null,
      sharingProvisioningPending: settings.sharingProvisioningPending ?? false,
      sharingDeletionPending: settings.sharingDeletionPending ?? false,
      lastPublishedMiles: settings.lastPublishedMiles ?? null,
      lastSharedProgressSyncAt: settings.lastSharedProgressSyncAt ?? null,
      isLoaded: true,
    });
  },
}));

// Helper hook to get the current theme object. Also subscribes to `textSize`
// so any component using a themed style automatically re-renders when the
// user changes the Text size setting.
export const useTheme = () => {
  const themeName = useSettingsStore(state => state.currentTheme);
  // Subscribe (return value discarded) so `typographyThemed(theme)` results
  // are recomputed on Text size changes.
  useSettingsStore(state => state.textSize);
  return themes[themeName];
};
