import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { StyleSheet, View, Animated, StatusBar, AppState } from 'react-native';

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

const Stack = createStackNavigator();

// Splash overlay - root level, fades out when loading completes
function SplashOverlay({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!loading) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [loading, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.splashFill, { opacity }]}
    />
  );
}

function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const setPhase = useInitializationStore(state => state.setPhase);

  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  // Set up periodic sync when health sync is enabled
  useSyncInterval();
  useFriendProgressSync();

  const initFromDatabase = useProgressStore(state => state.initFromDatabase);

  useEffect(() => {
    const initApp = async () => {
      console.log('[App] initApp: start');
      try {
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
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        console.log('[App] initApp: finally -> setLoading(false), phase=ready');
        // Loading complete
        setLoading(false);
        setPhase('ready');
      }
    };

    initApp();
  }, [loadSettings, initFromDatabase, setPhase]);

  // Re-reconcile tracking-mode state whenever the app returns to the
  // foreground. Catches: user granted/revoked ACTIVITY_RECOGNITION in
  // system Settings, the OS killed our foreground service, or the
  // persisted `syncEnabled` flag drifted from the actual native state
  // (see ensureTrackingModeRunning docstring for the recovery cases).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        ensureTrackingModeRunning().catch(err =>
          console.warn('[App] tracking-mode reconcile on resume failed:', err),
        );
      }
    });
    return () => sub.remove();
  }, []);

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

        {/* Splash - rendered LAST, hides everything until loading completes */}
        <SplashOverlay loading={loading} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splashFill: {
    backgroundColor: '#000000',
  },
});

export default App;
