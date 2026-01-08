import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { StyleSheet, View, Animated } from 'react-native';

import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/screens/WelcomeModal';
import SharedModal from './src/screens/SharedModal';
import { useSettingsStore } from './src/stores/settingsStore';
import { useSyncInterval } from './src/hooks/useSyncInterval';

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

  // Set up periodic sync when health sync is enabled
  useSyncInterval();

  const initFromDatabase = useProgressStore(state => state.initFromDatabase);

  useEffect(() => {
    const initApp = async () => {
      try {
        await database.init();
        await loadSettings();
        // Initialize progress store from database (single source of truth)
        await initFromDatabase();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        // Loading complete
        setLoading(false);
        setPhase('ready');
      }
    };

    initApp();
  }, [loadSettings, initFromDatabase, setPhase]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
});

export default App;
