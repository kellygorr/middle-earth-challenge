import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TouchableOpacity, StyleSheet } from 'react-native';
import MapScreen from './src/screens/MapScreen';
import WelcomeModal from './src/components/WelcomeModal';
import { useSettingsStore } from './src/stores/settingsStore';

const Stack = createStackNavigator();

function App(): React.JSX.Element {
  const showWelcome = useSettingsStore(state => state.showWelcome);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);

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

export default App;
