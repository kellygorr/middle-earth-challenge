import React, { useEffect, useRef, useState } from 'react';
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
import { useSettingsStore } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';
import { useFriendProgressSync } from './src/hooks/useFriendProgressSync';

import { useInitializationStore } from './src/stores/initializationStore';
import { database } from './src/services/database';
import { useProgressStore } from './src/stores/progressStore';
import { setupDevMockLongSyncIfEnabled } from './src/services/devSyncMock';
import { ensureTrackingModeRunning } from './src/services/trackingModeService';
import { initializeFirebaseAppCheck } from './src/services/firebaseAppCheck';

const Stack = createStackNavigator();

// Splash overlay - root level, fades out when loading completes
export function SplashOverlay({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setShowSpinner(false);
      opacity.setValue(1);
      const spinnerTimer = setTimeout(() => setShowSpinner(true), 200);
      return () => clearTimeout(spinnerTimer);
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      delay: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [loading, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.splashFill, { opacity }]}
    >
      {showSpinner && (
        <ActivityIndicator
          accessibilityLabel="Loading saved journey"
          color="#ffffff"
          size="large"
        />
      )}
    </Animated.View>
  );
}

function App(): React.JSX.Element {
  const [bootstrapStatus, setBootstrapStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const setPhase = useInitializationStore(state => state.setPhase);

  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  // Set up periodic sync when health sync is enabled
  useSyncInterval();
  useFriendProgressSync();

  const initFromDatabase = useProgressStore(state => state.initFromDatabase);

  useEffect(() => {
    let cancelled = false;

    const initApp = async () => {
      console.log('[App] initApp: start');
      setBootstrapStatus('loading');
      setPhase('loading');
      try {
        initializeFirebaseAppCheck();
        console.log('[App] initApp: Firebase App Check ready');
        await database.init();
        console.log('[App] initApp: db ready');
        await loadSettings();
        console.log('[App] initApp: settings loaded');
        // Initialize progress store from database (single source of truth)
        await initFromDatabase();
        console.log('[App] initApp: progress loaded');
        // Dev-only: if DEV_MOCK_LONG_SYNC is on, swap in mock fitness data
        // before useSyncInterval's initial sync runs.
        await setupDevMockLongSyncIfEnabled();
        console.log('[App] initApp: dev mock setup done');
        // If the user previously chose pedometer mode, make sure the
        // Android foreground service is (re)started after cold boot.
        await ensureTrackingModeRunning();
        console.log('[App] initApp: tracking mode ready');
        if (!cancelled) {
          setPhase('ready');
          setBootstrapStatus('ready');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        if (!cancelled) {
          setBootstrapStatus('error');
        }
      }
    };

    initApp();
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt, loadSettings, initFromDatabase, setPhase]);

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
            <Stack.Screen name="Map" component={MapScreen} />
          </Stack.Navigator>
        </NavigationContainer>

        {/* Global Modals */}
        {showWelcome && (
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
          <View style={styles.bootstrapError} accessibilityRole="alert">
            <Text style={styles.bootstrapErrorTitle}>Unable to load data</Text>
            <Text style={styles.bootstrapErrorMessage}>
              Your saved journey has not been changed. Try loading it again.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry initialization"
              onPress={() => setBootstrapAttempt(attempt => attempt + 1)}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Splash - rendered LAST, hides everything until loading completes */}
        <SplashOverlay loading={bootstrapStatus === 'loading'} />
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
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  bootstrapError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#101010',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bootstrapErrorTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
  },
  bootstrapErrorMessage: {
    color: '#d0d0d0',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    borderColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
