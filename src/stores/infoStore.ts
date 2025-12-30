import { create } from 'zustand';
import { CheckpointType } from '../types';

interface InfoStore {
  // State
  currentItem: CheckpointType | null;
  isModalVisible: boolean;
  itemType: 'checkpoint' | 'trivia' | null;
  // Info button + tooltip state
  showInfoButtonOnce: boolean;
  showStartupTooltip: boolean;
  tooltipPosition: { top: number; left: number } | null;
  observeMilesChanges: boolean;

  // Actions
  showInfo: (item: CheckpointType, type: 'checkpoint' | 'trivia') => void;
  hideInfo: () => void;
  openModal: () => void;
  closeModal: () => void;
  setShowInfoButtonOnce: (show: boolean) => void;
  setShowStartupTooltip: (show: boolean) => void;
  setTooltipPosition: (pos: { top: number; left: number } | null) => void;
  setObserveMilesChanges: (observe: boolean) => void;
  resetInfoUI: () => void;
}

export const useInfoStore = create<InfoStore>((set, get) => ({
  // Initial state
  currentItem: null,
  isModalVisible: false,
  itemType: null,
  showInfoButtonOnce: false,
  showStartupTooltip: false,
  tooltipPosition: null,
  observeMilesChanges: false,

  // Actions
  showInfo: (item, type) =>
    set({
      currentItem: item,
      itemType: type,
      isModalVisible: false, // Start with modal closed
    }),

  hideInfo: () =>
    set({
      currentItem: null,
      itemType: null,
      isModalVisible: false,
    }),

  openModal: () => {
    const { currentItem } = get();
    if (currentItem) {
      set({ isModalVisible: true });
    }
  },

  closeModal: () => {
    set({ isModalVisible: false });
  },

  setShowInfoButtonOnce: show => set({ showInfoButtonOnce: show }),
  setShowStartupTooltip: show => set({ showStartupTooltip: show }),
  setTooltipPosition: pos => set({ tooltipPosition: pos }),
  setObserveMilesChanges: observe => set({ observeMilesChanges: observe }),
  resetInfoUI: () =>
    set({
      showInfoButtonOnce: false,
      showStartupTooltip: false,
      tooltipPosition: null,
      observeMilesChanges: false,
    }),
}));
