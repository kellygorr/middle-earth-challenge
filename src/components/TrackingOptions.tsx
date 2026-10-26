import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useProgressStore } from '../stores/progressStore';
import ButtonRow from './Modals/ButtonRow';
import { SyncIcon, PlusIcon, DevModeIcon } from '../assets/icons';
import SettingsIcon from '../assets/icons/SettingsIcon';
import InlineIconLink from './InlineIconLink';
import { typographyThemed } from '../styles/typography';
import { spacing, iconSizes } from '../styles/global';

interface TrackingOptionsProps {
  onOpenSyncModal: () => void;
  /** Show the manual "Add or edit miles" row. Default true. */
  showAddOption?: boolean;
  /** Show the dev-mode toggle row. Default true. */
  showDevToggle?: boolean;
  /** Reduce vertical spacing for embedded contexts. */
  compact?: boolean;
}

export function TrackingOptions({
  onOpenSyncModal,
  showAddOption = true,
  showDevToggle = true,
  compact = false,
}: TrackingOptionsProps) {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);
  // Disable manual miles entry while a sync is in progress — avoids racing
  // user edits against chunked writes from the sync service.
  const isSyncing = useProgressStore(
    state => state.syncStatus.phase === 'syncing',
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Sync button - opens sync modal overlay on top of InfoModal */}
      <ButtonRow
        icon={<SyncIcon size={iconSizes.medium} />}
        active={syncEnabled}
        compact={compact}
        onPress={onOpenSyncModal}
        caption={
          syncEnabled ? (
            <Text style={typographyThemed(theme).captionSecondary}>
              Health sync enabled. Tap to manage sync options
            </Text>
          ) : (
            <Text style={typographyThemed(theme).captionSecondary}>
              Sync health data from device (optional). Manage this at any time
              from{' '}
              <InlineIconLink
                icon={SettingsIcon}
                label="Settings"
                textColor={theme.colors.textSecondary}
                onPress={() =>
                  useUIStore.getState().pushModal({ type: 'settings' })
                }
                accessibilityLabel="Open Settings"
              />
              .
            </Text>
          )
        }
      />

      {/* Manual add button - pushes Distance on top so back returns here */}
      {showAddOption && (
        <ButtonRow
          icon={<PlusIcon size={iconSizes.medium} />}
          disabled={isSyncing}
          compact={compact}
          onPress={() => {
            useUIStore.getState().pushModal({ type: 'distance' });
          }}
          caption={
            isSyncing
              ? `Add ${useMiles ? 'miles' : 'kilometers'} after syncing\u2026`
              : `Add or edit ${useMiles ? 'miles' : 'kilometers'}`
          }
        />
      )}

      {/* Dev mode toggle */}
      {showDevToggle && (
        <ButtonRow
          icon={<DevModeIcon size={iconSizes.medium} />}
          active={devMode}
          compact={compact}
          onPress={() => setDevMode(!devMode)}
          caption={
            devMode
              ? 'Dev mode is enabled'
              : 'Not ready to commit? Explore the map in dev mode'
          }
        />
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
  containerCompact: {
    gap: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionText: {
    flex: 1,
    flexShrink: 1,
  },
});
