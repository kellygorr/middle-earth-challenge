import { create } from 'zustand';
import { UserSettings, LabelSize, TextSize, SyncProvider } from '../types';
import { ThemeName, themes } from '../styles/themes';
import { database } from '../services/database';
import { useProgressStore } from './progressStore';

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
  setLiveSyncEnabled: (enabled: boolean) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>(set => ({
  // Initial state
  id: 'default',
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
  liveSyncEnabled: false,

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
    set({ syncEnabled: enabled });
    database.updateUserSettings({ syncEnabled: enabled });
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

  setLiveSyncEnabled: enabled => {
    set({ liveSyncEnabled: enabled });
    database.updateUserSettings({ liveSyncEnabled: enabled });
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
        liveSyncEnabled: settings.liveSyncEnabled ?? false,
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
