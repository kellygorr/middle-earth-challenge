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

  // True for the remainder of this app session once the current launch's
  // database.init() reported (or devSyncMock's dev-only force flag
  // simulated) a protected legacy-schema upgrade — see database.ts's
  // `wasProtectedUpgrade`/`isLegacyUpgradeMissingSchemaMeta`. Deliberately
  // in-memory only (this store is never persisted/hydrated from disk, so
  // there is nothing to clear on sign-out/logout) — it naturally resets to
  // false the next time the app process actually starts, which is exactly
  // the lifetime a "you were just upgraded" welcome-screen message should
  // have: shown for the rest of this session (e.g. still true if the user
  // backgrounds and returns, or revisits Welcome from Settings), gone
  // again on the next real cold launch.
  wasJustUpgraded: boolean;
  // Wall-clock time wasJustUpgraded was last set true, for display (e.g.
  // "Today at 4:12 PM" on the synthesized card SyncErrorBanner renders for
  // this — see its 'newUpgrade' SyncError kind). Null whenever
  // wasJustUpgraded is false.
  wasJustUpgradedAt: number | null;

  // Actions
  setPhase: (phase: InitPhase) => void;
  requestRestart: () => void;
  setWasJustUpgraded: (value: boolean) => void;

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
    wasJustUpgraded: false,
    wasJustUpgradedAt: null,

    setPhase: (phase: InitPhase) => set({ phase }),

    requestRestart: () => {
      const current = get().restartToken;
      set({ restartToken: current + 1, phase: 'ready' });
    },

    setWasJustUpgraded: (value: boolean) =>
      set({
        wasJustUpgraded: value,
        wasJustUpgradedAt: value ? Date.now() : null,
      }),

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
