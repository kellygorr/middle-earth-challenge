import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

let initialized = false;

// Confirmed open upstream bug (react-native-firebase#9354, still unresolved
// as of this writing): on React Native's New Architecture (TurboModules +
// Bridgeless), the native `NativeRNFBTurboApp` module can race with very
// early JS bootstrap code and not be registered yet on a device's first-ever
// cold launch right after install — `getApp()` then throws (surfacing here
// as either `Native module NativeRNFBTurboApp is not registered.` or a
// `Cannot read property '...' of undefined` depending on exactly where the
// race is hit). Confirmed on-device: this does NOT recur on any subsequent
// launch, only the very first one. Retrying a few times with a short delay
// gives the native module registry time to finish settling before giving up
// — this step is already wrapped as "recoverable" by its caller
// (`runRecoverableBootstrapStep` in App.tsx), so even an exhausted retry
// here degrades gracefully (App Check simply won't be active for that
// session) rather than blocking startup, but the retry means real users
// essentially never see the version of this that used to surface as an
// uncaught-error overlay on their very first launch.
const MAX_INIT_ATTEMPTS = 3;
const RETRY_DELAY_MS = [50, 150, 300];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const getFirebaseAppCheckProviderOptions = (isDevelopment: boolean) => ({
  android: {
    provider: isDevelopment ? ('debug' as const) : ('playIntegrity' as const),
  },
  apple: {
    provider: isDevelopment
      ? ('debug' as const)
      : ('appAttestWithDeviceCheckFallback' as const),
  },
});

export const initializeFirebaseAppCheck = async (): Promise<void> => {
  if (initialized) return;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_INIT_ATTEMPTS; attempt++) {
    try {
      const provider = new ReactNativeFirebaseAppCheckProvider();
      provider.configure(getFirebaseAppCheckProviderOptions(__DEV__));

      initializeAppCheck(getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      initialized = true;
      return;
    } catch (error) {
      lastError = error;
      // Give the native module registry a beat to finish settling before
      // trying again. Skipped on the final attempt so we fail fast (via the
      // throw below) instead of waiting out a delay we won't use.
      if (attempt < MAX_INIT_ATTEMPTS - 1) {
        await delay(RETRY_DELAY_MS[attempt]);
      }
    }
  }
  throw lastError;
};

// Test-only: resets the module-scope `initialized` guard so each test can
// exercise `initializeFirebaseAppCheck()` from a clean state. Mirrors the
// pattern used by `useResumeEpoch`'s `__resetResumeEpochForTests` —
// `jest.resetModules()` was considered and rejected for this kind of reset
// elsewhere in this codebase because it also resets React itself and breaks
// `@testing-library/react-native`'s shared dispatcher; an explicit reset
// export avoids that entirely and is simpler for a plain (non-React)
// service module like this one regardless.
export const __resetFirebaseAppCheckForTests = (): void => {
  initialized = false;
};
