import { create } from 'zustand';

interface UIStore {
  // Modal visibility state
  showSettings: boolean;
  showMilesModal: boolean;
  showStats: boolean;

  // Actions
  setShowSettings: (show: boolean) => void;
  setShowMilesModal: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
}

export const useUIStore = create<UIStore>(set => ({
  // Initial state
  showSettings: false,
  showMilesModal: false,
  showStats: false,

  // Actions
  setShowSettings: show => set({ showSettings: show }),
  setShowMilesModal: show => set({ showMilesModal: show }),
  setShowStats: show => set({ showStats: show }),
}));
