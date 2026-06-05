import { NativeModules, Platform } from 'react-native';

export type BackgroundRefreshStatusValue =
  | 'available'
  | 'denied'
  | 'restricted'
  // Returned on non-iOS platforms or when the native module isn't linked
  // (e.g. JS-only test environments). Treat the same as "not a problem".
  | 'unsupported';

interface BackgroundRefreshStatusModule {
  get(): Promise<'available' | 'denied' | 'restricted'>;
}

const nativeModule: BackgroundRefreshStatusModule | undefined =
  NativeModules.BackgroundRefreshStatus;

/**
 * Reads UIApplication.backgroundRefreshStatus via a small Swift module
 * (see ios/MiddleEarthChallenge/BackgroundRefreshStatus.swift).
 *
 * Returns 'unsupported' on Android or if the module isn't linked, so
 * callers can branch on a single union without platform checks of their
 * own.
 */
export async function getBackgroundRefreshStatus(): Promise<BackgroundRefreshStatusValue> {
  if (Platform.OS !== 'ios' || !nativeModule) {
    return 'unsupported';
  }
  try {
    return await nativeModule.get();
  } catch {
    // Native call shouldn't reject — but if it does, don't pretend we know.
    return 'unsupported';
  }
}
