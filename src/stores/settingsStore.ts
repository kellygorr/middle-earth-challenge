import { create } from 'zustand';
import {
  UserSettings,
  LabelSize,
  TextSize,
  SyncProvider,
  TrackingMode,
  FriendAffinity,
} from '../types';
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
  setSyncEnabled: (enabled: boolean) => void;
  setSyncProvider: (provider: SyncProvider) => void;
  setSyncStartDate: (date: number | null) => void;
  setLastSyncTimestamp: (timestamp: number | null) => void;
  setLastHealthReconciledThrough: (timestamp: number | null) => void;
  setLiveSyncEnabled: (enabled: boolean) => void;
  setTrackingMode: (mode: TrackingMode) => void;
  setHasSeenOemBatteryPrompt: (seen: boolean) => void;
  setHcRevokePendingRestart: (pending: boolean) => void;
  setLastNotifiedCheckpointIndex: (index: number) => void;
  setSharingEnabled: (enabled: boolean) => void;
  setSharingDisplayName: (displayName: string | null) => void;
  setSharingAffinity: (affinity: FriendAffinity | null) => void;
  setSharingDeletionPending: (pending: boolean) => void;
  setLastPublishedMiles: (miles: number | null) => void;
  setLastSharedProgressSyncAt: (timestamp: number | null) => void;
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
  lastHealthReconciledThrough: null,
  liveSyncEnabled: false,
  trackingMode: 'health-app',
  hasSeenOemBatteryPrompt: false,
  hcRevokePendingRestart: false,
  lastNotifiedCheckpointIndex: -1,
  sharingEnabled: false,
  sharingDisplayName: null,
  sharingAffinity: null,
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
  setSyncEnabled: enabled => {
    const resetDualReconciliation =
      !enabled && useSettingsStore.getState().trackingMode === 'dual';
    set({
      syncEnabled: enabled,
      ...(resetDualReconciliation ? { lastHealthReconciledThrough: null } : {}),
    });
    database.updateUserSettings({
      syncEnabled: enabled,
      ...(resetDualReconciliation ? { lastHealthReconciledThrough: null } : {}),
    });
  },

  setSyncProvider: provider => {
    set({ syncProvider: provider });
    database.updateUserSettings({ syncProvider: provider });
  },

  setSyncStartDate: date => {
    set({ syncStartDate: date });
    database.updateUserSettings({ syncStartDate: date });
  },

  setLastSyncTimestamp: timestamp => {
    set({ lastSyncTimestamp: timestamp });
    database.updateUserSettings({ lastSyncTimestamp: timestamp });
  },

  setLastHealthReconciledThrough: timestamp => {
    set({ lastHealthReconciledThrough: timestamp });
    database.updateUserSettings({ lastHealthReconciledThrough: timestamp });
  },

  setLiveSyncEnabled: enabled => {
    set({ liveSyncEnabled: enabled });
    database.updateUserSettings({ liveSyncEnabled: enabled });
  },

  setTrackingMode: mode => {
    set({ trackingMode: mode });
    database.updateUserSettings({ trackingMode: mode });
  },

  setHasSeenOemBatteryPrompt: seen => {
    set({ hasSeenOemBatteryPrompt: seen });
    database.updateUserSettings({ hasSeenOemBatteryPrompt: seen });
  },

  setHcRevokePendingRestart: pending => {
    set({ hcRevokePendingRestart: pending });
    database.updateUserSettings({ hcRevokePendingRestart: pending });
  },

  setLastNotifiedCheckpointIndex: index => {
    set({ lastNotifiedCheckpointIndex: index });
    database.updateUserSettings({ lastNotifiedCheckpointIndex: index });
  },

  setSharingEnabled: enabled => {
    set({ sharingEnabled: enabled });
    database.updateUserSettings({ sharingEnabled: enabled });
  },

  setSharingDisplayName: displayName => {
    set({ sharingDisplayName: displayName });
    database.updateUserSettings({ sharingDisplayName: displayName });
  },

  setSharingAffinity: affinity => {
    set({ sharingAffinity: affinity });
    database.updateUserSettings({ sharingAffinity: affinity });
  },

  setSharingDeletionPending: pending => {
    set({ sharingDeletionPending: pending });
    database.updateUserSettings({ sharingDeletionPending: pending });
  },

  setLastPublishedMiles: miles => {
    set({ lastPublishedMiles: miles });
    database.updateUserSettings({ lastPublishedMiles: miles });
  },

  setLastSharedProgressSyncAt: timestamp => {
    set({ lastSharedProgressSyncAt: timestamp });
    database.updateUserSettings({ lastSharedProgressSyncAt: timestamp });
  },

  loadSettings: async () => {
    try {
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
        lastHealthReconciledThrough:
          settings.lastHealthReconciledThrough ?? null,
        liveSyncEnabled: settings.liveSyncEnabled ?? false,
        trackingMode: settings.trackingMode ?? 'health-app',
        hasSeenOemBatteryPrompt: settings.hasSeenOemBatteryPrompt ?? false,
        hcRevokePendingRestart: settings.hcRevokePendingRestart ?? false,
        lastNotifiedCheckpointIndex: settings.lastNotifiedCheckpointIndex ?? -1,
        sharingEnabled: settings.sharingEnabled ?? false,
        sharingDisplayName: settings.sharingDisplayName ?? null,
        sharingAffinity: settings.sharingAffinity ?? null,
        sharingDeletionPending: settings.sharingDeletionPending ?? false,
        lastPublishedMiles: settings.lastPublishedMiles ?? null,
        lastSharedProgressSyncAt: settings.lastSharedProgressSyncAt ?? null,
        isLoaded: true,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true }); // Still mark as loaded to unblock app
    }
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
