import { create } from 'zustand';

interface MapStore {
  // Map transform state
  scale: number;
  translateX: number;
  translateY: number;

  // Animation state
  isAnimatingPath: boolean;
  pathAnimationProgress: number; // 0-1

  // UI state
  selectedCheckpoint: number | null;
  selectedTrivia: string | null;
  showSettings: boolean;

  // Actions
  setScale: (scale: number) => void;
  setTranslate: (x: number, y: number) => void;
  setIsAnimatingPath: (animating: boolean) => void;
  setPathAnimationProgress: (progress: number) => void;
  setSelectedCheckpoint: (checkpoint: number | null) => void;
  setSelectedTrivia: (triviaId: string | null) => void;
  setShowSettings: (show: boolean) => void;
  resetMapTransform: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  // Initial state
  scale: 1,
  translateX: 0,
  translateY: 0,
  isAnimatingPath: false,
  pathAnimationProgress: 0,
  selectedCheckpoint: null,
  selectedTrivia: null,
  showSettings: false,

  // Actions
  setScale: (scale) => set({ scale: Math.max(1, Math.min(5, scale)) }),

  setTranslate: (x, y) => set({ translateX: x, translateY: y }),

  setIsAnimatingPath: (animating) => set({ isAnimatingPath: animating }),

  setPathAnimationProgress: (progress) =>
    set({ pathAnimationProgress: Math.max(0, Math.min(1, progress)) }),

  setSelectedCheckpoint: (checkpoint) => set({ selectedCheckpoint: checkpoint }),

  setSelectedTrivia: (triviaId) => set({ selectedTrivia: triviaId }),

  setShowSettings: (show) => set({ showSettings: show }),

  resetMapTransform: () => set({ scale: 1, translateX: 0, translateY: 0 }),
}));
