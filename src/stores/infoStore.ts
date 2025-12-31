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
  showStartupTooltip: boolean;
  tooltipPosition: { top: number; left: number } | null;
  observeMilesChanges: boolean;
  // Sticky visibility: keep InfoButton visible until miles change
  stickyUntilMilesChange: boolean;
  lastMilesAtSelection: number | null;

  // Actions
  setCurrentItem: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  showInfo: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  hideInfo: () => void;
  openModal: () => void;
  closeModal: () => void;
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
  showStartupTooltip: false,
  tooltipPosition: null,
  observeMilesChanges: false,
  stickyUntilMilesChange: false,
  lastMilesAtSelection: null,

  // Actions
  setCurrentItem: (item, type) =>
    set({
      currentItem: item,
      itemType: type,
    }),
  showInfo: (item, type) =>
    set({
      currentItem: item,
      itemType: type,
      isModalVisible: false, // Start with modal closed
      stickyUntilMilesChange: true,
      lastMilesAtSelection: useProgressStore.getState().miles || 0,
    }),

  hideInfo: () =>
    set({
      currentItem: null,
      itemType: null,
      isModalVisible: false,
      stickyUntilMilesChange: false,
      lastMilesAtSelection: null,
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

  setShowStartupTooltip: show => set({ showStartupTooltip: show }),
  setTooltipPosition: pos => set({ tooltipPosition: pos }),
  setObserveMilesChanges: observe => set({ observeMilesChanges: observe }),
  resetInfoUI: () =>
    set({
      showStartupTooltip: false,
      tooltipPosition: null,
      observeMilesChanges: false,
      stickyUntilMilesChange: false,
      lastMilesAtSelection: null,
    }),
  // Derived selectors
  getShouldShowInfoButton: (animatedProgress: number) => {
    const {
      currentItem,
      itemType,
      isModalVisible,
      stickyUntilMilesChange,
      lastMilesAtSelection,
    } = get();
    if (!currentItem) return false;
    const miles = useProgressStore.getState().miles || 0;
    const isCheckpointItem = itemType === 'checkpoint';
    const isTriviaItem = itemType === 'trivia';
    const eps = 1e-6;

    // Show the original InfoButton whenever the modal is open
    if (isModalVisible) return true;

    // Keep InfoButton visible after closing until miles change
    if (stickyUntilMilesChange && lastMilesAtSelection != null) {
      const unchanged = Math.abs(miles - lastMilesAtSelection) < eps;
      if (unchanged) return true;
    }

    if (isCheckpointItem) {
      const m = currentItem.CUMULATIVE_MILES ?? 0;
      const threshold = mapBookMilesToPathProgress(m);
      const isExact = Math.abs(miles - m) < eps;
      return isExact && animatedProgress + eps >= threshold;
    }
    return isTriviaItem;
  },
}));
