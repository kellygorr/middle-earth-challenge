import { create } from 'zustand';
import { UserSettings } from '../types';
import { ThemeName, themes } from '../styles/themes';

interface SettingsStore extends UserSettings {
  // Actions
  setCheckpointLabelSize: (size: number) => void;
  setTheme: (theme: ThemeName) => void;
  setShowTriviaMarkers: (show: boolean) => void;
  setShowCheckpointLabels: (show: boolean) => void;
  setColorizeMap: (colorize: boolean) => void;
  loadSettings: (settings: UserSettings) => void;
}

export const useSettingsStore = create<SettingsStore>(set => ({
  // Initial state
  id: 'default',
  checkpointLabelSize: 2,
  currentTheme: 'minimalist',
  showTriviaMarkers: true,
  showCheckpointLabels: true,
  colorizeMap: false,

  // Actions
  setCheckpointLabelSize: size =>
    set({ checkpointLabelSize: Math.max(1, Math.min(3, size)) }),

  setTheme: theme => set({ currentTheme: theme }),

  setShowTriviaMarkers: show => set({ showTriviaMarkers: show }),

  setShowCheckpointLabels: show => set({ showCheckpointLabels: show }),

  setColorizeMap: colorize => set({ colorizeMap: colorize }),

  loadSettings: settings => set(settings),
}));

// Helper hook to get the current theme object
export const useTheme = () => {
  const themeName = useSettingsStore(state => state.currentTheme);
  return themes[themeName];
};
