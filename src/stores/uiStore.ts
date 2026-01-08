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
interface ReturnToContext {
  modal: ModalScreenType;
  params?: Record<string, any>;
}

interface UIStore {
  // Modal navigation stack - empty means no modal visible
  modalStack: ModalScreen[];

  // Simple return-to tracking for modal-to-modal navigation
  returnTo: ReturnToContext | null;

  // Pending miles state (ephemeral, reset on modal close)
  pendingEntries: DistanceEntry[];
  pendingDeletions: DistanceEntry[];
  editingEntry: DistanceEntry | null;
  editDate: number | null;

  // Legacy individual modal visibility (kept for backward compatibility during migration)
  showSettings: boolean;
  showStats: boolean;
  showSyncModal: boolean;

  // Stack navigation actions
  pushModal: (screen: ModalScreen) => void;
  popModal: () => void;
  replaceModal: (screen: ModalScreen) => void;
  closeAllModals: () => void;

  // Get the current (top) modal screen
  getCurrentModal: () => ModalScreen | null;

  // Check if a specific modal type is currently in the stack
  isModalOpen: (type: ModalScreenType) => boolean;

  // Return-to navigation
  setReturnTo: (context: ReturnToContext | null) => void;
  navigateBack: () => void;

  // Pending miles actions
  addPendingEntry: (entry: DistanceEntry) => void;
  updatePendingEntry: (id: string, updates: Partial<DistanceEntry>) => void;
  removePendingEntry: (id: string) => void;
  markForDeletion: (entry: DistanceEntry) => void;
  setEditingEntry: (entry: DistanceEntry | null, date?: number) => void;
  resetPendingMiles: () => void;

  // Legacy actions (kept for backward compatibility during migration)
  setShowSettings: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setShowSyncModal: (show: boolean) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  modalStack: [],
  returnTo: null,
  pendingEntries: [],
  pendingDeletions: [],
  editingEntry: null,
  editDate: null,
  showSettings: false,
  showStats: false,
  showSyncModal: false,

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

  closeAllModals: () => set({ modalStack: [], returnTo: null }),

  getCurrentModal: () => {
    const stack = get().modalStack;
    return stack.length > 0 ? stack[stack.length - 1] : null;
  },

  isModalOpen: type => {
    return get().modalStack.some(screen => screen.type === type);
  },

  // Return-to navigation
  setReturnTo: context => set({ returnTo: context }),

  navigateBack: () => {
    const { returnTo } = get();
    if (returnTo) {
      // Clear returnTo and open the target modal
      set({ returnTo: null });
      // Use pushModal for migrated modals, legacy setters for others
      switch (returnTo.modal) {
        case 'settings':
          get().pushModal({ type: 'settings' });
          break;
        case 'miles':
          get().pushModal({ type: 'miles' });
          break;
        case 'stats':
          get().pushModal({ type: 'stats' });
          break;
        case 'sync':
          get().pushModal({ type: 'sync' });
          break;
        case 'info':
          // InfoModal uses infoStore, handled separately
          break;
      }
    }
  },

  // Pending miles actions
  addPendingEntry: entry =>
    set(state => ({
      pendingEntries: [entry, ...state.pendingEntries],
    })),

  updatePendingEntry: (id, updates) =>
    set(state => ({
      pendingEntries: state.pendingEntries.map(e =>
        e.id === id ? { ...e, ...updates } : e,
      ),
    })),

  removePendingEntry: id =>
    set(state => ({
      pendingEntries: state.pendingEntries.filter(e => e.id !== id),
    })),

  markForDeletion: entry =>
    set(state => ({
      pendingDeletions: [...state.pendingDeletions, entry],
    })),

  setEditingEntry: (entry, date) =>
    set({
      editingEntry: entry,
      editDate: date ?? entry?.date ?? null,
    }),

  resetPendingMiles: () =>
    set({
      pendingEntries: [],
      pendingDeletions: [],
      editingEntry: null,
      editDate: null,
    }),

  // Legacy actions
  setShowSettings: show => set({ showSettings: show }),
  setShowStats: show => set({ showStats: show }),
  setShowSyncModal: show => set({ showSyncModal: show }),
}));
