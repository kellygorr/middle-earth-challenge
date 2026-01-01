import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, Animated } from 'react-native';

import MapScreen from './src/screens/MapScreen';
import {
  WelcomeModal,
  SettingsModal,
  StatsModal,
  ManualMilesModal,
  InfoModal,
} from './src/components/Modals';
import { useSettingsStore } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';
import { useUIStore } from './src/stores/uiStore';
import { useInfoStore } from './src/stores/infoStore';
import { useInitializationStore } from './src/stores/initializationStore';
import { database } from './src/services/database';
import { useProgressStore } from './src/stores/progressStore';

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
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: '#000000', opacity },
      ]}
    />
  );
}

function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const setPhase = useInitializationStore(state => state.setPhase);

  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  // UI modal state from uiStore
  const showSettings = useUIStore(state => state.showSettings);
  const setShowSettings = useUIStore(state => state.setShowSettings);
  const showStats = useUIStore(state => state.showStats);
  const setShowStats = useUIStore(state => state.setShowStats);
  const showManualMilesModal = useUIStore(state => state.showManualMilesModal);
  const setShowManualMilesModal = useUIStore(
    state => state.setShowManualMilesModal,
  );

  const isInfoVisible = useInfoStore(state => state.isModalVisible);
  const closeInfoModal = useInfoStore(state => state.closeModal);

  // Set up periodic sync when health sync is enabled
  useSyncInterval();

  const setDistanceEntries = useProgressStore(
    state => state.setDistanceEntries,
  );
  const setMiles = useProgressStore(state => state.setMiles);

  useEffect(() => {
    const initApp = async () => {
      try {
        await database.init();
        await loadSettings();
        // Restore miles from snapshot; fallback to distances if snapshot missing
        const saveId = 'default';
        const snapshot = await database.getMilesSnapshot(saveId);
        if (snapshot !== null) {
          setMiles(snapshot);
          const entries = await database.getDistanceEntries(saveId);
          setDistanceEntries(entries);
        } else {
          const entries = await database.getDistanceEntries(saveId);
          setDistanceEntries(entries);
          const totalMiles = (entries || []).reduce(
            (sum, e) => sum + (e?.miles ?? 0),
            0,
          );
          setMiles(totalMiles);
          await database.setMilesSnapshot(saveId, totalMiles);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        // Loading complete
        setLoading(false);
        setPhase('ready');
      }
    };

    initApp();
  }, [loadSettings, setDistanceEntries, setMiles, setPhase]);

  return (
    <SafeAreaProvider>
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
        <WelcomeModal
          visible={showWelcome}
          onDismiss={() => {
            setShowWelcome(false);
            // Transition to revealing phase when welcome is dismissed
            setPhase('revealing');
          }}
        />
        <SettingsModal
          visible={showSettings}
          onDismiss={() => setShowSettings(false)}
        />
        <StatsModal visible={showStats} onDismiss={() => setShowStats(false)} />
        <ManualMilesModal
          visible={showManualMilesModal}
          onDismiss={() => setShowManualMilesModal(false)}
        />
        <InfoModal visible={isInfoVisible} onDismiss={closeInfoModal} />

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
});

export default App;
