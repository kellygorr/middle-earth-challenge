import { create } from 'zustand';

/**
 * Initialization phases:
 * - loading: App starting, DB init, hydrating stores
 * - ready: Data loaded, welcome screen visible
 * - revealing: Welcome dismissed, base path animating
 * - active: Animations complete, fully interactive
 */
export type InitPhase = 'loading' | 'ready' | 'revealing' | 'active';

interface InitializationStore {
  // Current phase of app initialization lifecycle
  phase: InitPhase;

  // Monotonic signal to request a restart (subscribers can react to changes)
  restartToken: number;

  // Actions
  setPhase: (phase: InitPhase) => void;
  requestRestart: () => void;

  // Derived helpers
  isLoading: () => boolean;
  isReady: () => boolean;
  isRevealing: () => boolean;
  isActive: () => boolean;

  // Game progress animation enabled (derived from phase === 'active')
  // Kept as explicit selector for backward compatibility
  gameProgressAnimEnabled: () => boolean;
}

export const useInitializationStore = create<InitializationStore>(
  (set, get) => ({
    phase: 'loading',
    restartToken: 0,

    setPhase: (phase: InitPhase) => set({ phase }),

    requestRestart: () => {
      const current = get().restartToken;
      set({ restartToken: current + 1, phase: 'ready' });
    },

    // Derived helpers
    isLoading: () => get().phase === 'loading',
    isReady: () => get().phase === 'ready',
    isRevealing: () => get().phase === 'revealing',
    isActive: () => get().phase === 'active',

    // Game progress animation is enabled only in active phase
    gameProgressAnimEnabled: () => get().phase === 'active',
  }),
);

/**
 * Phase transitions:
 *
 * App.tsx (after DB init + hydration):
 *   useInitializationStore.getState().setPhase('ready')
 *
 * WelcomeModal (on dismiss):
 *   useInitializationStore.getState().setPhase('revealing')
 *
 * useInitialAnimation (after path reveal complete):
 *   useInitializationStore.getState().setPhase('active')
 *
 * To restart onboarding:
 *   useInitializationStore.getState().requestRestart()
 */
