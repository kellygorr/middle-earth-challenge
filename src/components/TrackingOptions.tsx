import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { IconButton } from './Buttons';
import { SyncIcon, PlusIcon, DevModeIcon } from '../assets/icons';
import SettingsRef from './SettingsRef';
import { typographyThemed } from '../styles/typography';
import { spacing, iconSizes } from '../styles/global';

interface TrackingOptionsProps {
  /** Required when `showAddOption` is true (default). */
  onDismiss?: (afterCallback?: () => void) => void;
  onOpenSyncModal: () => void;
  /** Show the manual "Add or edit miles" row. Default true. */
  showAddOption?: boolean;
  /** Show the dev-mode toggle row. Default true. */
  showDevToggle?: boolean;
}

export function TrackingOptions({
  onDismiss,
  onOpenSyncModal,
  showAddOption = true,
  showDevToggle = true,
}: TrackingOptionsProps) {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);

  return (
    <View style={styles.container}>
      {/* Sync button - opens sync modal overlay on top of InfoModal */}
      <Pressable style={styles.option} onPress={onOpenSyncModal}>
        <IconButton
          icon={<SyncIcon size={iconSizes.medium} />}
          variant={syncEnabled ? 'brand' : 'outline'}
        />
        {syncEnabled ? (
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.optionText,
            ]}
          >
            Health sync enabled. Tap to manage sync options
          </Text>
        ) : (
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.optionText,
            ]}
          >
            Sync health data from device (optional). Manage this at any time
            from <SettingsRef variant="captionSecondary" />.
          </Text>
        )}
      </Pressable>

      {/* Manual add button - dismisses InfoModal first, then opens MilesModal */}
      {showAddOption && (
        <Pressable
          style={styles.option}
          onPress={() => {
            // Set returnTo so MilesModal returns to info when closed
            useUIStore.getState().setReturnTo({ modal: 'info' });
            // Dismiss InfoModal, then open Miles modal after exit animation completes
            onDismiss?.(() => {
              useUIStore.getState().pushModal({ type: 'miles' });
            });
          }}
        >
          <IconButton icon={<PlusIcon size={iconSizes.medium} />} />
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.optionText,
            ]}
          >
            Add or edit {useMiles ? 'miles' : 'kilometers'}
          </Text>
        </Pressable>
      )}

      {/* Dev mode toggle */}
      {showDevToggle && (
        <Pressable style={styles.option} onPress={() => setDevMode(!devMode)}>
          <IconButton
            icon={<DevModeIcon size={iconSizes.medium} />}
            variant={devMode ? 'brand' : 'outline'}
          />
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.optionText,
            ]}
          >
            {devMode
              ? 'Dev mode is enabled. Tap to disable'
              : 'Not ready to commit? Explore the map in dev mode'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionText: {
    flex: 1,
    flexShrink: 1,
  },
});
