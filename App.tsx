import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/components/WelcomeModal';
import { useSettingsStore } from './src/stores/settingsStore';
import { database } from './src/services/database';

const Stack = createStackNavigator();

function App(): React.JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  const loadSettings = useSettingsStore(state => state.loadSettings);

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

      {/* Welcome Modal */}
      <WelcomeModal
        visible={showWelcome}
        onDismiss={() => setShowWelcome(false)}
      />
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
