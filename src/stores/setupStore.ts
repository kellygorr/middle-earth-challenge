import { create } from 'zustand';

type SetupPhase = 'idle' | 'setup' | 'ready';

interface SetupStore {
  // Whether the app should run onboarding/setup flows
  setupEnabled: boolean;
  // Current phase of setup lifecycle
  phase: SetupPhase;
  // Monotonic signal to request a restart (subscribers can react to changes)
  restartToken: number;

  // Actions
  enableSetup: () => void;
  disableSetup: () => void;
  startSetup: () => void;
  completeSetup: () => void;
  requestRestart: () => void;
}

export const useSetupStore = create<SetupStore>((set, get) => ({
  setupEnabled: true,
  phase: 'idle',
  restartToken: 0,

  enableSetup: () => set({ setupEnabled: true }),
  disableSetup: () => set({ setupEnabled: false }),

  startSetup: () => set({ phase: 'setup' }),
  completeSetup: () => set({ phase: 'ready', setupEnabled: false }),

  requestRestart: () => {
    const current = get().restartToken;
    // Turn setup back on and move to setup phase
    set({ restartToken: current + 1, setupEnabled: true, phase: 'setup' });
  },
}));

/**
 * Suggested usage (not wired here):
 *
 * In App.tsx or a root effect:
 * const restartToken = useSetupStore(state => state.restartToken);
 * useEffect(() => {
 *   if (!restartToken) return;
 *   // Example: show welcome + reset transient UI
 *   useSettingsStore.getState().setShowWelcome(true);
 *   // Optionally reset progress/map stores here
 * }, [restartToken]);
 *
 * To programmatically restart onboarding:
 * useSetupStore.getState().requestRestart();
 */
