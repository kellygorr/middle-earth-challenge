import { create } from 'zustand';
import { PointType } from '../types';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { useProgressStore } from './progressStore';

interface InfoStore {
  // State
  currentItem: PointType | null;
  isModalVisible: boolean;
  itemType: 'checkpoint' | 'trivia' | null;
  // Info button + tooltip state
  showInfoButtonOnce: boolean;
  showStartupTooltip: boolean;
  tooltipPosition: { top: number; left: number } | null;
  observeMilesChanges: boolean;

  // Actions
  showInfo: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  hideInfo: () => void;
  openModal: () => void;
  closeModal: () => void;
  setShowInfoButtonOnce: (show: boolean) => void;
  setShowStartupTooltip: (show: boolean) => void;
  setTooltipPosition: (pos: { top: number; left: number } | null) => void;
  setObserveMilesChanges: (observe: boolean) => void;
  resetInfoUI: () => void;
  // Derived selectors
  getShouldShowInfoButton: (animatedProgress: number) => boolean;
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
  // Derived selectors
  getShouldShowInfoButton: (animatedProgress: number) => {
    const { currentItem, itemType } = get();
    if (!currentItem) return false;
    const miles = useProgressStore.getState().miles || 0;
    const isCheckpointItem =
      itemType === 'checkpoint' && 'CUMULATIVE_MILES' in (currentItem || {});
    const isTriviaItem = itemType === 'trivia';
    const eps = 1e-6;

    if (isCheckpointItem) {
      const m = (currentItem as any).CUMULATIVE_MILES ?? 0;
      const threshold = mapBookMilesToPathProgress(m);
      const isExact = Math.abs(miles - m) < eps;
      return isExact && animatedProgress + eps >= threshold;
    }
    return isTriviaItem;
  },
}));
