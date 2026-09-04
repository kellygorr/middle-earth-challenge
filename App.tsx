import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import {
  StyleSheet,
  View,
  Animated,
  StatusBar,
  AppState,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native';

import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/screens/WelcomeModal';
import SharedModal from './src/screens/SharedModal';
import { useSettingsStore, useTheme } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';
import { useFriendProgressSync } from './src/hooks/useFriendProgressSync';
import { useLivePedometerDeltaOwner } from './src/hooks/useLivePedometerDelta';

import { useInitializationStore } from './src/stores/initializationStore';
import { database } from './src/services/database';
import { useProgressStore } from './src/stores/progressStore';
import { setupDevMockLongSyncIfEnabled } from './src/services/devSyncMock';
import { ensureTrackingModeRunning } from './src/services/trackingModeService';
import { initializeFirebaseAppCheck } from './src/services/firebaseAppCheck';

const Stack = createStackNavigator();
const MAP_READY_TIMEOUT_MS = 1500;

type BootstrapStatus = 'loading' | 'ready' | 'error';

export function getSplashStatus({
  bootstrapStatus,
  mapReady,
  mapReadyTimedOut,
}: {
  bootstrapStatus: BootstrapStatus;
  mapReady: boolean;
  mapReadyTimedOut: boolean;
}): BootstrapStatus {
  if (bootstrapStatus === 'error') return 'error';
  if (bootstrapStatus === 'ready' && (mapReady || mapReadyTimedOut)) {
    return 'ready';
  }
  return 'loading';
}

export function shouldShowWelcomeModal({
  bootstrapStatus,
  splashHidden,
  showWelcome,
}: {
  bootstrapStatus: BootstrapStatus;
  splashHidden: boolean;
  showWelcome: boolean;
}): boolean {
  return bootstrapStatus === 'ready' && splashHidden && showWelcome;
}

export async function runRecoverableBootstrapStep(
  name: string,
  operation: () => void | Promise<void>,
): Promise<void> {
  const start = Date.now();
  console.log(`[App] initApp: ${name} start`);
  try {
    await operation();
    console.log(`[App] initApp: ${name} ready in ${Date.now() - start}ms`);
  } catch (error) {
    console.warn(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
  }
}

async function runRequiredBootstrapStep(
  name: string,
  operation: () => void | Promise<void>,
): Promise<void> {
  const start = Date.now();
  console.log(`[App] initApp: ${name} start`);
  try {
    await operation();
    console.log(`[App] initApp: ${name} ready in ${Date.now() - start}ms`);
  } catch (error) {
    console.error(
      `[App] initApp: ${name} failed in ${Date.now() - start}ms:`,
      error,
    );
    throw error;
  }
}

// Splash overlay - root level, fades out only after successful hydration
export function SplashOverlay({
  status,
  onHidden,
}: {
  status: BootstrapStatus;
  onHidden?: () => void;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    activeAnimation.current?.stop();
    activeAnimation.current = null;

    if (status === 'loading') {
      setVisible(true);
      setShowSpinner(false);
      opacity.setValue(1);
      const spinnerTimer = setTimeout(() => setShowSpinner(true), 200);
      return () => clearTimeout(spinnerTimer);
    }

    if (status === 'error') {
      setVisible(false);
      onHidden?.();
      return;
    }

    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      delay: 200,
      useNativeDriver: true,
    });
    activeAnimation.current = animation;
    animation.start(({ finished }) => {
      if (finished) {
        setVisible(false);
        onHidden?.();
      }
    });

    return () => {
      animation.stop();
      if (activeAnimation.current === animation) {
        activeAnimation.current = null;
      }
    };
  }, [status, opacity, onHidden]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      testID="splash-overlay"
      style={[
        StyleSheet.absoluteFillObject,
        styles.splashFill,
        { backgroundColor: theme.colors.splashBackground, opacity },
      ]}
    >
      {showSpinner && (
        <ActivityIndicator
          accessibilityLabel="Loading saved journey"
          color={theme.colors.iconInverted}
          size="large"
        />
      )}
    </Animated.View>
  );
}

function App(): React.JSX.Element {
  const theme = useTheme();
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapReadyTimedOut, setMapReadyTimedOut] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const setPhase = useInitializationStore(state => state.setPhase);

  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  // Set up periodic sync when health sync is enabled
  useSyncInterval();
  useFriendProgressSync();
  useLivePedometerDeltaOwner();

  const initFromDatabase = useProgressStore(state => state.initFromDatabase);

  useEffect(() => {
    let cancelled = false;

    const initApp = async () => {
      console.log('[App] initApp: start');
      setBootstrapStatus('loading');
      setMapReady(false);
      setMapReadyTimedOut(false);
      setSplashHidden(false);
      setPhase('loading');

      await runRecoverableBootstrapStep('Firebase App Check', () =>
        initializeFirebaseAppCheck(),
      );

      try {
        await runRequiredBootstrapStep('database.init', () => database.init());
        await runRequiredBootstrapStep('loadSettings', () => loadSettings());
        // Initialize progress store from database (single source of truth)
        await runRequiredBootstrapStep('initFromDatabase', () =>
          initFromDatabase(),
        );
      } catch (error) {
        console.error('Failed to initialize app:', error);
        if (!cancelled) {
          setBootstrapStatus('error');
        }
        return;
      }

      // These services can be repaired or retried after the user's saved
      // state is safe to render, so they must not turn hydration into a
      // blocking startup failure.
      await runRecoverableBootstrapStep('dev mock setup', () =>
        setupDevMockLongSyncIfEnabled(),
      );
      await runRecoverableBootstrapStep('tracking mode', () =>
        ensureTrackingModeRunning(),
      );

      if (!cancelled) {
        setPhase('ready');
        setBootstrapStatus('ready');
      }
    };

    initApp();
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt, loadSettings, initFromDatabase, setPhase]);

  useEffect(() => {
    if (bootstrapStatus !== 'ready' || mapReady) return;

    const timer = setTimeout(() => {
      console.warn('[App] Map visual readiness timed out');
      setMapReadyTimedOut(true);
    }, MAP_READY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [bootstrapStatus, mapReady]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleSplashHidden = useCallback(() => {
    setSplashHidden(true);
  }, []);

  const splashStatus = getSplashStatus({
    bootstrapStatus,
    mapReady,
    mapReadyTimedOut,
  });

  useEffect(() => {
    console.log('[App] splash state', {
      bootstrapStatus,
      mapReady,
      mapReadyTimedOut,
      splashStatus,
      splashHidden,
    });
  }, [
    bootstrapStatus,
    mapReady,
    mapReadyTimedOut,
    splashStatus,
    splashHidden,
  ]);

  // Re-reconcile tracking-mode state whenever the app returns to the
  // foreground. Catches: user granted/revoked ACTIVITY_RECOGNITION in
  // system Settings, the OS killed our foreground service, or the
  // persisted native-cleanup request still needs to finish (see
  // ensureTrackingModeRunning docstring for the recovery cases).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && bootstrapStatus === 'ready') {
        ensureTrackingModeRunning().catch(err =>
          console.warn('[App] tracking-mode reconcile on resume failed:', err),
        );
      }
    });
    return () => sub.remove();
  }, [bootstrapStatus]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={styles.container}>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Map">
              {() => (
                <MapScreen
                  mapReadyEnabled={bootstrapStatus === 'ready'}
                  mapReadyToken={bootstrapAttempt}
                  onMapReady={handleMapReady}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>

        {/* Global Modals */}
        {shouldShowWelcomeModal({
          bootstrapStatus,
          splashHidden,
          showWelcome,
        }) && (
          <WelcomeModal
            visible={showWelcome}
            onDismiss={() => {
              setShowWelcome(false);
              // Transition to revealing phase when welcome is dismissed
              setPhase('revealing');
            }}
          />
        )}

        {/* SharedModal - stack-based modal navigation */}
        <SharedModal />

        {bootstrapStatus === 'error' && (
          <View
            style={[
              styles.bootstrapError,
              { backgroundColor: theme.colors.splashErrorBackground },
            ]}
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.bootstrapErrorTitle,
                { color: theme.colors.splashText },
              ]}
            >
              Unable to load data
            </Text>
            <Text
              style={[
                styles.bootstrapErrorMessage,
                { color: theme.colors.splashTextSecondary },
              ]}
            >
              Your saved journey has not been changed. Try loading it again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry initialization"
              onPress={() => setBootstrapAttempt(attempt => attempt + 1)}
              style={[
                styles.retryButton,
                { borderColor: theme.colors.splashBorder },
              ]}
            >
              <Text
                style={[
                  styles.retryButtonText,
                  { color: theme.colors.splashText },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* Splash - rendered LAST, hides everything until loading completes */}
        <SplashOverlay status={splashStatus} onHidden={handleSplashHidden} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashFill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootstrapError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bootstrapErrorTitle: {
    fontSize: 22,
    fontWeight: '600',
  },
  bootstrapErrorMessage: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
