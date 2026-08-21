import { create } from 'zustand';
import { ModalType } from '../constants/modals';
import { DistanceEntry } from '../types';

// Re-export for convenience
export type ModalScreenType = ModalType;

// Configuration for each modal screen
export interface ModalScreen {
  type: ModalScreenType;
  // Optional title override for dynamic titles (e.g., "Checkpoint #3")
  title?: string;
  // Optional params for specific screens (e.g., info screen context)
  params?: Record<string, any>;
}

// Return-to context for modal navigation
interface UIStore {
  // Modal navigation stack - empty means no modal visible
  modalStack: ModalScreen[];

  // Entry currently open in the edit popup
  editingEntry: DistanceEntry | null;
  editDate: number | null;

  // Stack navigation actions
  pushModal: (screen: ModalScreen) => void;
  popModal: () => void;
  replaceModal: (screen: ModalScreen) => void;
  closeAllModals: () => void;

  // Get the current (top) modal screen
  getCurrentModal: () => ModalScreen | null;

  // Check if a specific modal type is currently in the stack
  isModalOpen: (type: ModalScreenType) => boolean;

  // Edit popup actions
  setEditingEntry: (entry: DistanceEntry | null, date?: number) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  modalStack: [],
  editingEntry: null,
  editDate: null,

  // Stack navigation actions
  pushModal: screen =>
    set(state => ({
      modalStack: [...state.modalStack, screen],
    })),

  popModal: () =>
    set(state => ({
      modalStack: state.modalStack.slice(0, -1),
    })),

  replaceModal: screen =>
    set(state => ({
      modalStack: [...state.modalStack.slice(0, -1), screen],
    })),

  closeAllModals: () => set({ modalStack: [] }),

  getCurrentModal: () => {
    const stack = get().modalStack;
    return stack.length > 0 ? stack[stack.length - 1] : null;
  },

  isModalOpen: type => {
    return get().modalStack.some(screen => screen.type === type);
  },

  // Edit popup actions
  setEditingEntry: (entry, date) =>
    set({
      editingEntry: entry,
      editDate: date ?? entry?.date ?? null,
    }),
}));
