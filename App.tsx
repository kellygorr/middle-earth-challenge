import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import MapScreen from './src/screens/MapScreen';
import {
  WelcomeModal,
  SettingsModal,
  ManualMilesModal,
  InfoModal,
} from './src/components/Modals';
import { useSettingsStore } from './src/stores/settingsStore';
import { useInfoStore } from './src/stores/infoStore';
import { database } from './src/services/database';

const Stack = createStackNavigator();

function App(): React.JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);
  const showSettings = useSettingsStore(state => state.showSettings);
  const setShowSettings = useSettingsStore(state => state.setShowSettings);
  const showManualMilesModal = useSettingsStore(
    state => state.showManualMilesModal,
  );
  const setShowManualMilesModal = useSettingsStore(
    state => state.setShowManualMilesModal,
  );
  const isInfoVisible = useInfoStore(state => state.isModalVisible);
  const closeInfoModal = useInfoStore(state => state.closeModal);

  useEffect(() => {
    const initApp = async () => {
      try {
        await database.init();
        await loadSettings();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    initApp();
  }, [loadSettings]);

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B4513" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
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
        onDismiss={() => setShowWelcome(false)}
      />
      <SettingsModal
        visible={showSettings}
        onDismiss={() => setShowSettings(false)}
      />
      <ManualMilesModal
        visible={showManualMilesModal}
        onDismiss={() => setShowManualMilesModal(false)}
      />
      <InfoModal visible={isInfoVisible} onDismiss={closeInfoModal} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4E8D0',
  },
});

export default App;
