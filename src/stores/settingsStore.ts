import { create } from 'zustand';
import { UserSettings, LabelSize } from '../types';
import { ThemeName, themes } from '../styles/themes';

interface SettingsStore extends UserSettings {
  showWelcome: boolean;
  // Actions
  setLabelSize: (size: LabelSize) => void;
  setTheme: (theme: ThemeName) => void;
  setShowTriviaMarkers: (show: boolean) => void;
  setShowCheckpointLabels: (show: boolean) => void;
  setColorizeMap: (colorize: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  setShowMapTitles: (show: boolean) => void;
  loadSettings: (settings: UserSettings) => void;
}

export const useSettingsStore = create<SettingsStore>(set => ({
  // Initial state
  id: 'default',
  labelSize: 'regular',
  currentTheme: 'minimalist',
  showTriviaMarkers: true,
  showCheckpointLabels: true,
  colorizeMap: false,
  showWelcome: true,
  showMapTitles: true,

  // Actions
  setLabelSize: size => set({ labelSize: size }),

  setTheme: theme => set({ currentTheme: theme }),

  setShowTriviaMarkers: show => set({ showTriviaMarkers: show }),

  setShowCheckpointLabels: show => set({ showCheckpointLabels: show }),

  setColorizeMap: colorize => set({ colorizeMap: colorize }),

  setShowWelcome: show => set({ showWelcome: show }),

  setShowMapTitles: show => set({ showMapTitles: show }),

  loadSettings: settings => set(settings),
}));

// Helper hook to get the current theme object
export const useTheme = () => {
  const themeName = useSettingsStore(state => state.currentTheme);
  return themes[themeName];
};
