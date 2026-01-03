import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { SyncButton, PlusButton, DevModeButton } from './ButtonIcons';
import { typographyThemed } from '../styles/typography';
import { spacing, iconSizes } from '../styles/global';

interface TrackingOptionsProps {
  onDismiss: () => void;
  onOpenSyncModal: () => void;
}

export function TrackingOptions({
  onDismiss,
  onOpenSyncModal,
}: TrackingOptionsProps) {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);

  return (
    <View style={styles.container}>
      {/* Sync button - always opens sync modal */}
      <Pressable
        style={styles.option}
        onPress={() => {
          onDismiss();
          onOpenSyncModal();
        }}
      >
        <View style={styles.buttonContainer}>
          <SyncButton
            size={iconSizes.medium}
            variant={syncEnabled ? 'brand' : 'primary'}
          />
        </View>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.optionText]}
        >
          {syncEnabled
            ? 'Health sync enabled. Tap to manage sync options'
            : 'Sync health data from device (optional). Manage this at any time from Settings'}
        </Text>
      </Pressable>

      {/* Manual add button */}
      <Pressable
        style={styles.option}
        onPress={() => {
          onDismiss();
          useUIStore.getState().setShowMilesModal(true);
        }}
      >
        <View style={styles.buttonContainer}>
          <PlusButton size={iconSizes.medium} />
        </View>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.optionText]}
        >
          Manually add or edit miles
        </Text>
      </Pressable>

      {/* Dev mode toggle */}
      <Pressable style={styles.option} onPress={() => setDevMode(!devMode)}>
        <View style={styles.buttonContainer}>
          <DevModeButton
            size={iconSizes.medium}
            variant={devMode ? 'brand' : 'primary'}
          />
        </View>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.optionText]}
        >
          {devMode
            ? 'Dev mode is enabled. Tap to disable'
            : 'Not ready to commit? Explore the map in dev mode'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  buttonContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    flexShrink: 1,
  },
});
