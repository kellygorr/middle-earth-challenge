import { create } from 'zustand';

interface UIStore {
  // Modal visibility state
  showSettings: boolean;
  showManualMilesModal: boolean;
  showStats: boolean;

  // Actions
  setShowSettings: (show: boolean) => void;
  setShowManualMilesModal: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
}

export const useUIStore = create<UIStore>(set => ({
  // Initial state
  showSettings: false,
  showManualMilesModal: false,
  showStats: false,

  // Actions
  setShowSettings: show => set({ showSettings: show }),
  setShowManualMilesModal: show => set({ showManualMilesModal: show }),
  setShowStats: show => set({ showStats: show }),
}));
