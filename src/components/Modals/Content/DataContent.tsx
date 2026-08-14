import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, borderRadius } from '../../../styles/global';
import Button from '../../Buttons/Button';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import { friendProgressWorkflow } from '../../../services/friendProgressWorkflow';

/**
 * DataContent - Content component for the Data modal.
 * Provides options to manage user data: delete synced data,
 * reset settings, and reset all progress.
 */
export default function DataContent() {
  const theme = useTheme();

  // Distance entries
  const distanceEntries = useProgressStore(state => state.distanceEntries);
  const hasSyncedData = distanceEntries.some(e => e.source !== 'manual');
  const hasManualData = distanceEntries.some(e => e.source === 'manual');
  const hasAnyData = distanceEntries.length > 0;
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const sharingDeletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const hasSharedData = sharingEnabled || sharingDeletionPending;
  const hasAllData = hasAnyData || hasSharedData;

  const handleDeleteSharedData = async () => {
    Alert.alert(
      'Delete Shared Data',
      'Delete your shared name and journey distance? Your local journey progress will not be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (sharingDeletionPending) {
                await friendProgressWorkflow.retryPendingDeletion();
              } else {
                await friendProgressWorkflow.disableSharing();
              }
            } catch {
              Alert.alert(
                'Deletion Pending',
                'Sharing is off. The app will keep only what it needs to retry deleting the cloud row.',
              );
            }
          },
        },
      ],
    );
  };

  // Delete synced data only
  const handleDeleteSyncedData = async () => {
    Alert.alert(
      'Delete Synced Data',
      'Do you want to delete all synced data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Bulk-remove in a single store/DB write so the UI doesn't
            // freeze when there are hundreds of chunked-sync entries.
            await useProgressStore
              .getState()
              .removeDistanceEntriesBySource([
                'health-connect',
                'apple-health',
                'pedometer',
              ]);

            // Reset sync bookmarks so the next sync's fromDate falls back
            // to syncStartDate (now) instead of the pre-reset lastSync-
            // Timestamp, which would silently re-import the deleted data.
            const settings = useSettingsStore.getState();
            settings.setSyncStartDate(Date.now());
            settings.setLastSyncTimestamp(null);
          },
        },
      ],
    );
  };

  // Delete manual data only
  const handleDeleteManualData = async () => {
    Alert.alert(
      'Delete Manual Data',
      'Do you want to delete all manual entries? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await useProgressStore
              .getState()
              .removeDistanceEntriesBySource(['manual']);
          },
        },
      ],
    );
  };

  // Delete all distance data (synced + manual)
  const handleDeleteAllProgress = async () => {
    Alert.alert(
      'Delete All Data',
      'Delete all local journey data and any shared name and distance? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            if (hasSharedData) {
              try {
                if (sharingDeletionPending) {
                  await friendProgressWorkflow.retryPendingDeletion();
                } else {
                  await friendProgressWorkflow.disableSharing();
                }
              } catch {
                // Local deletion must still complete. The persisted pending
                // marker keeps cloud cleanup retryable.
              }
            }

            // resetProgress() does a single setState + one SQL DELETE +
            // one miles snapshot write — no per-entry looping.
            await useProgressStore.getState().resetProgress();

            // Reset sync bookmarks so the next sync's fromDate falls back
            // to syncStartDate (now) instead of the pre-reset lastSync-
            // Timestamp, which would silently re-import the deleted data.
            const settings = useSettingsStore.getState();
            settings.setSyncStartDate(Date.now());
            settings.setLastSyncTimestamp(null);
          },
        },
      ],
    );
  };

  // Reset settings to default
  const handleResetSettings = async () => {
    Alert.alert(
      'Reset Settings',
      'This will reset all settings to their defaults (theme, map options, dev mode, etc.). Your journey progress will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            // Reset settings store to defaults
            const store = useSettingsStore.getState();
            store.setTheme('minimalist');
            store.setLabelSize('medium');
            store.setColorizeMap(false);
            store.setReducedMapTitles(true);
            store.setDevMode(false);
            store.setUseMiles(true);
            store.setLiveSyncEnabled(false);
            // Note: We don't disconnect sync here, just reset visual settings
          },
        },
      ],
    );
  };

  return (
    <>
      {/* Data Management */}
      <Section>
        <SectionHeader title="Manage data" />

        {/* Delete synced data */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Delete synced data
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Remove all synced health data. This does not disconnect syncing —
              future syncs will import data from this point forward.
            </Text>
          </View>
          {hasSyncedData ? (
            <Button
              onPress={handleDeleteSyncedData}
              variant="outline"
              size="default"
            >
              Delete
            </Button>
          ) : (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.emptyStateBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.emptyStateText },
                ]}
              >
                No data
              </Text>
            </View>
          )}
        </View>

        {/* Delete manual data */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Delete manual data
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Remove all manually created entries
            </Text>
          </View>
          {hasManualData ? (
            <Button
              onPress={handleDeleteManualData}
              variant="outline"
              size="default"
            >
              Delete
            </Button>
          ) : (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.emptyStateBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.emptyStateText },
                ]}
              >
                No data
              </Text>
            </View>
          )}
        </View>

        {/* Delete shared cloud data */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <View style={styles.flex1}>
            <Text style={typographyThemed(theme).bodyPrimary}>
              Delete shared data
            </Text>
            <Text style={typographyThemed(theme).captionSecondary}>
              Delete your shared name and distance and turn sharing off
            </Text>
          </View>
          {hasSharedData ? (
            <Button
              onPress={handleDeleteSharedData}
              variant="outline"
              size="default"
            >
              {sharingDeletionPending ? 'Retry' : 'Delete'}
            </Button>
          ) : (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.emptyStateBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.emptyStateText },
                ]}
              >
                No shared data
              </Text>
            </View>
          )}
        </View>

        {/* Delete all data */}
        <View style={[styles.contentRow]}>
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Delete all data
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Remove all manual and synced data. This does not disconnect
              syncing — future syncs will import data from this point forward.
            </Text>
          </View>
          {hasAllData ? (
            <Button
              onPress={handleDeleteAllProgress}
              variant="outline"
              size="default"
            >
              Delete
            </Button>
          ) : (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.emptyStateBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.emptyStateText },
                ]}
              >
                No data
              </Text>
            </View>
          )}
        </View>
      </Section>

      {/* Settings */}
      <Section>
        <SectionHeader title="Settings" />

        <View style={[styles.contentRow]}>
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Reset settings
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Restore theme, map options, and other settings to defaults
            </Text>
          </View>
          <Button
            onPress={handleResetSettings}
            variant="outline"
            size="default"
          >
            Reset
          </Button>
        </View>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  contentRowBorderBottom: {
    borderBottomWidth: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
});
