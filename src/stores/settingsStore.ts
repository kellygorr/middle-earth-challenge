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
  setShowCheckpointLabels: (show: boolean) => void;
  setColorizeMap: (colorize: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  setReducedMapTitles: (reduced: boolean) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Initial state
  id: 'default',
  labelSize: 'regular',
  currentTheme: 'classic',
  showTriviaMarkers: true,
  showCheckpointLabels: true,
  colorizeMap: false,
  showWelcome: true,
  reducedMapTitles: true,
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

  setShowCheckpointLabels: show => {
    set({ showCheckpointLabels: show });
    database.updateUserSettings({ showCheckpointLabels: show });
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

  loadSettings: async () => {
    try {
      const settings = await database.getUserSettings();
      set({
        id: settings.id,
        labelSize: settings.labelSize,
        currentTheme: settings.currentTheme,
        showTriviaMarkers: settings.showTriviaMarkers,
        showCheckpointLabels: settings.showCheckpointLabels,
        colorizeMap: settings.colorizeMap,
        reducedMapTitles: settings.reducedMapTitles,
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
