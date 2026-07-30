/**
 * SyncNowRow - row with the sync icon, a "Sync" label, and a "Sync now"
 * action button. Drives `requestSyncNow()` so the user can manually retry
 * after an error or just refresh on demand.
 *
 * Visible only when health sync is currently connected (provider !== 'none'
 * and syncEnabled). Hidden otherwise — there's nothing to sync from.
 *
 * Used in two places:
 *   1. SyncErrorBanner — gives the user a one-tap retry next to the error.
 *   2. SyncContent (Health data section) — manual refresh control.
 *
 * The button is disabled while a sync is already in progress so a quick
 * double-tap doesn't queue a redundant call (requestSyncNow is also guarded
 * upstream, but disabling is the honest visual cue).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { requestSyncNow } from '../hooks/useSyncInterval';
import Button from './Buttons/Button';
import { typographyThemed } from '../styles/typography';
import { spacing } from '../styles/global';

export function SyncNowRow() {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const isSyncing = useProgressStore(
    state => state.syncStatus.phase === 'syncing',
  );

  if (!syncEnabled || syncProvider === 'none' || trackingMode === 'dual') {
    return null;
  }

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text
          style={typographyThemed(theme).captionSecondary}
          numberOfLines={2}
        >
          Pull the latest activity from your health app
        </Text>
        {lastSyncTimestamp && (
          <Text style={typographyThemed(theme).captionSecondary}>
            {`Last synced: ${new Date(lastSyncTimestamp).toLocaleString(
              undefined,
              {
                dateStyle: 'short',
                timeStyle: 'short',
              },
            )}`}
          </Text>
        )}
      </View>
      <Button
        variant="brand"
        size="small"
        disabled={isSyncing}
        onPress={() => {
          requestSyncNow();
        }}
      >
        {isSyncing ? 'Syncing\u2026' : 'Sync'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
});
