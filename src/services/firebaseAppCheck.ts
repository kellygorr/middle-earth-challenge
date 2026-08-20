import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

let initialized = false;

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

export const initializeFirebaseAppCheck = (): void => {
  if (initialized) return;

  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure(getFirebaseAppCheckProviderOptions(__DEV__));

  initializeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
};
