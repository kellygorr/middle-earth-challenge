import { create } from 'zustand';
import { PointType } from '../types';
import { mapBookMilesToPathProgress } from '../utils/pathProgress';
import { useProgressStore } from './progressStore';
import { useUIStore } from './uiStore';

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
  // Celebration state for checkpoint animations
  showCelebration: boolean;

  // Actions
  setCurrentItem: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  showInfo: (
    item: PointType,
    type: 'checkpoint' | 'trivia',
    sticky?: boolean,
  ) => void;
  hideInfo: () => void;
  openModal: () => void;
  closeModal: () => void;
  /** Opens the info modal via SharedModal stack with computed title */
  openInfoModal: (item: PointType, type: 'checkpoint' | 'trivia') => void;
  clearStickyInfo: () => void;
  setShowStartupTooltip: (show: boolean) => void;
  setTooltipPosition: (pos: { top: number; left: number } | null) => void;
  setObserveMilesChanges: (observe: boolean) => void;
  setShowCelebration: (show: boolean) => void;
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
  showCelebration: false,

  // Actions
  setCurrentItem: (item, type) =>
    set({
      currentItem: item,
      itemType: type,
    }),
  showInfo: (item, type, sticky = true) =>
    set({
      currentItem: item,
      itemType: type,
      isModalVisible: false, // Start with modal closed
      stickyUntilMilesChange: sticky,
      lastMilesAtSelection: sticky
        ? useProgressStore.getState().miles || 0
        : null,
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
    const { currentItem, itemType } = get();
    if (currentItem && itemType) {
      // Compute title and push to SharedModal stack
      const checkpointNumber =
        itemType === 'checkpoint' && typeof currentItem.index === 'number'
          ? currentItem.index + 1
          : undefined;
      const title =
        itemType === 'checkpoint'
          ? typeof checkpointNumber === 'number'
            ? `Checkpoint #${checkpointNumber}`
            : 'Checkpoint'
          : 'Trivia';
      useUIStore.getState().pushModal({ type: 'info', title });
    }
  },

  closeModal: () => {
    set({ isModalVisible: false });
  },

  openInfoModal: (item, type) => {
    // Set current item in store
    set({
      currentItem: item,
      itemType: type,
      isModalVisible: false, // SharedModal handles visibility now
      stickyUntilMilesChange: true,
      lastMilesAtSelection: useProgressStore.getState().miles || 0,
    });

    // Compute title
    const checkpointNumber =
      type === 'checkpoint' && typeof item.index === 'number'
        ? item.index + 1
        : undefined;
    const title =
      type === 'checkpoint'
        ? typeof checkpointNumber === 'number'
          ? `Checkpoint #${checkpointNumber}`
          : 'Checkpoint'
        : 'Trivia';

    // Push to modal stack with title
    useUIStore.getState().pushModal({ type: 'info', title });
  },

  clearStickyInfo: () => {
    const { stickyUntilMilesChange } = get();
    // Don't clear if we're exactly on a checkpoint - the info should stay visible
    const activeInfo = useProgressStore.getState().getActiveInfoItem();
    if (activeInfo?.type === 'checkpoint') {
      return; // User is exactly on checkpoint, don't clear
    }
    // Only clear if we're in sticky mode (previewing a non-active point)
    if (stickyUntilMilesChange) {
      set({
        currentItem: null,
        itemType: null,
        stickyUntilMilesChange: false,
        lastMilesAtSelection: null,
      });
    }
  },

  setShowStartupTooltip: show => set({ showStartupTooltip: show }),
  setTooltipPosition: pos => set({ tooltipPosition: pos }),
  setObserveMilesChanges: observe => set({ observeMilesChanges: observe }),
  setShowCelebration: show => set({ showCelebration: show }),
  resetInfoUI: () =>
    set({
      showStartupTooltip: false,
      tooltipPosition: null,
      observeMilesChanges: false,
      stickyUntilMilesChange: false,
      lastMilesAtSelection: null,
      showCelebration: false,
    }),
  // Derived selectors
  getShouldShowInfoButton: (animatedProgress: number) => {
    const {
      currentItem,
      itemType,
      stickyUntilMilesChange,
      lastMilesAtSelection,
    } = get();
    if (!currentItem) return false;
    const miles = useProgressStore.getState().miles || 0;
    const isCheckpointItem = itemType === 'checkpoint';
    const isTriviaItem = itemType === 'trivia';
    const eps = 1e-6;

    // Show the original InfoButton whenever the info modal is open
    const isInfoModalOpen = useUIStore.getState().isModalOpen('info');
    if (isInfoModalOpen) return true;

    // Keep InfoButton visible after closing until miles change
    if (stickyUntilMilesChange && lastMilesAtSelection != null) {
      const unchanged = Math.abs(miles - lastMilesAtSelection) < eps;
      if (unchanged) return true;
    }

    if (isCheckpointItem || isTriviaItem) {
      const m = currentItem.CUMULATIVE_MILES ?? 0;
      const threshold = mapBookMilesToPathProgress(m);
      const isExact = Math.abs(miles - m) < eps;
      return isExact && animatedProgress + eps >= threshold;
    }
    return false;
  },
}));
