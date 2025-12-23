import { create } from 'zustand';
import { CheckpointType } from '../types';

interface InfoStore {
  // State
  currentItem: CheckpointType | null;
  isModalVisible: boolean;
  itemType: 'checkpoint' | 'trivia' | null;

  // Actions
  showInfo: (item: CheckpointType, type: 'checkpoint' | 'trivia') => void;
  hideInfo: () => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useInfoStore = create<InfoStore>((set, get) => ({
  // Initial state
  currentItem: null,
  isModalVisible: false,
  itemType: null,

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
}));
