import { create } from 'zustand';
import { UserSettings, LabelSize } from '../types';
import { ThemeName, themes } from '../styles/themes';
import { database } from '../services/database';

interface SettingsStore extends UserSettings {
  showWelcome: boolean;
  isLoaded: boolean;
  // Actions
  setLabelSize: (size: LabelSize) => void;
  setTheme: (theme: ThemeName) => void;
  setShowTriviaMarkers: (show: boolean) => void;
  setShowPointLabels: (show: boolean) => void;
  setColorizeMap: (colorize: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  setReducedMapTitles: (reduced: boolean) => void;
  setDevMode: (enabled: boolean) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>(set => ({
  // Initial state
  id: 'default',
  labelSize: 'regular',
  currentTheme: 'classic',
  showTriviaMarkers: true,
  showPointLabels: true,
  colorizeMap: false,
  showWelcome: true,
  reducedMapTitles: true,
  devMode: true,
  isLoaded: false,

  // Actions - each setter also persists to database
  setLabelSize: size => {
    set({ labelSize: size });
    database.updateUserSettings({ labelSize: size });
  },

  setTheme: theme => {
    set({ currentTheme: theme });
    database.updateUserSettings({ currentTheme: theme });
  },

  setShowTriviaMarkers: show => {
    set({ showTriviaMarkers: show });
    database.updateUserSettings({ showTriviaMarkers: show });
  },

  setShowPointLabels: show => {
    set({ showPointLabels: show });
    database.updateUserSettings({ showPointLabels: show });
  },

  setColorizeMap: colorize => {
    set({ colorizeMap: colorize });
    database.updateUserSettings({ colorizeMap: colorize });
  },

  setShowWelcome: show => set({ showWelcome: show }), // Not persisted - always shows on load

  setReducedMapTitles: reduced => {
    set({ reducedMapTitles: reduced });
    database.updateUserSettings({ reducedMapTitles: reduced });
  },

  setDevMode: enabled => {
    set({ devMode: enabled });
    database.updateUserSettings({ devMode: enabled });
  },

  loadSettings: async () => {
    try {
      const settings = await database.getUserSettings();
      set({
        id: settings.id,
        labelSize: settings.labelSize,
        currentTheme: settings.currentTheme,
        showTriviaMarkers: settings.showTriviaMarkers,
        showPointLabels: settings.showPointLabels,
        colorizeMap: settings.colorizeMap,
        reducedMapTitles: settings.reducedMapTitles,
        devMode:
          settings.devMode === undefined || settings.devMode === null
            ? true
            : settings.devMode,
        isLoaded: true,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true }); // Still mark as loaded to unblock app
    }
  },
}));

// Helper hook to get the current theme object
export const useTheme = () => {
  const themeName = useSettingsStore(state => state.currentTheme);
  return themes[themeName];
};
