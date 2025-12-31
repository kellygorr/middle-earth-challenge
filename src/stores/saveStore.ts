import { create } from 'zustand';
import { Save } from '../types';

interface SaveStore {
  // State
  saves: Save[];
  activeSave: Save | null;
  isLoading: boolean;

  // Actions
  setSaves: (saves: Save[]) => void;
  setActiveSave: (save: Save | null) => void;
  setIsLoading: (loading: boolean) => void;
  addSave: (save: Save) => void;
  updateSave: (saveId: string, updates: Partial<Save>) => void;
  removeSave: (saveId: string) => void;
}

export const useSaveStore = create<SaveStore>(set => ({
  // Initial state
  saves: [],
  activeSave: null,
  isLoading: true,

  // Actions
  setSaves: saves => set({ saves }),

  setActiveSave: save => set({ activeSave: save }),

  setIsLoading: loading => set({ isLoading: loading }),

  addSave: save => set(state => ({ saves: [save, ...state.saves] })),

  updateSave: (saveId, updates) =>
    set(state => ({
      saves: state.saves.map(s => (s.id === saveId ? { ...s, ...updates } : s)),
      activeSave:
        state.activeSave?.id === saveId
          ? { ...state.activeSave, ...updates }
          : state.activeSave,
    })),

  removeSave: saveId =>
    set(state => ({
      saves: state.saves.filter(s => s.id !== saveId),
      activeSave: state.activeSave?.id === saveId ? null : state.activeSave,
    })),
}));
