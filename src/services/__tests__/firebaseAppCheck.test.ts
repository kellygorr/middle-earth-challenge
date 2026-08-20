import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

import {
  getFirebaseAppCheckProviderOptions,
  initializeFirebaseAppCheck,
} from '../firebaseAppCheck';

describe('firebaseAppCheck', () => {
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

  it('initializes token auto-refresh only once', () => {
    initializeFirebaseAppCheck();
    initializeFirebaseAppCheck();

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
});
