import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

import {
  getFirebaseAppCheckProviderOptions,
  initializeFirebaseAppCheck,
  __resetFirebaseAppCheckForTests,
} from '../firebaseAppCheck';

describe('firebaseAppCheck', () => {
  beforeEach(() => {
    __resetFirebaseAppCheckForTests();
    jest.clearAllMocks();
  });

  it('uses attestation providers in release and debug providers in development', () => {
    expect(getFirebaseAppCheckProviderOptions(false)).toEqual({
      android: { provider: 'playIntegrity' },
      apple: { provider: 'appAttestWithDeviceCheckFallback' },
    });
    expect(getFirebaseAppCheckProviderOptions(true)).toEqual({
      android: { provider: 'debug' },
      apple: { provider: 'debug' },
    });
  });

  it('initializes token auto-refresh only once', async () => {
    await initializeFirebaseAppCheck();
    await initializeFirebaseAppCheck();

    const provider = (ReactNativeFirebaseAppCheckProvider as jest.Mock).mock
      .results[0].value;
    expect(provider.configure).toHaveBeenCalledWith(
      getFirebaseAppCheckProviderOptions(true),
    );
    expect(initializeAppCheck).toHaveBeenCalledWith(getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  // Regression for a confirmed-open upstream bug (react-native-firebase
  // #9354): on New Architecture (TurboModules + Bridgeless), the native
  // Firebase app module can race with very early JS bootstrap code and not
  // be registered yet on a device's first-ever cold launch, making
  // `getApp()` throw. Confirmed on-device that this never recurs on a
  // subsequent launch — only the very first one — so a short bounded retry
  // should recover without ever surfacing the failure to the caller.
  it('retries and recovers when the native module race makes getApp() throw transiently', async () => {
    jest.useFakeTimers();
    (getApp as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('Native module NativeRNFBTurboApp is not registered.');
      })
      .mockImplementationOnce(() => ({}));

    const resultPromise = initializeFirebaseAppCheck();
    // Let the first attempt's catch block schedule its retry delay, then
    // advance past it so the second attempt actually runs.
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(50);
    await resultPromise;

    expect(getApp).toHaveBeenCalledTimes(2);
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('gives up and throws after exhausting all retry attempts', async () => {
    jest.useFakeTimers();
    const persistentError = new Error('Native module still not registered.');
    (getApp as jest.Mock).mockImplementation(() => {
      throw persistentError;
    });

    // Attach the rejection assertion immediately, in the same synchronous
    // tick the promise is created — not after the timer advances below.
    // Awaiting `resultPromise` directly further down (without this) would
    // let it actually reject before anything is listening for it, since the
    // final attempt's throw settles the promise partway through the timer
    // advances; Node then reports a real unhandled rejection even though
    // the test goes on to correctly assert it, which intermittently fails
    // the test depending on microtask timing.
    const resultPromise = initializeFirebaseAppCheck();
    const rejection = expect(resultPromise).rejects.toBe(persistentError);
    // Three total attempts, two inter-attempt delays (50ms, 150ms) to
    // advance past before the final attempt's throw settles the promise.
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(150);
    await rejection;

    expect(getApp).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
