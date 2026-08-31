import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, borderRadius } from '../../../styles/global';
import Button from '../../Buttons/Button';
import { StatusBadge } from '../../StatusBadge';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import { friendProgressWorkflow } from '../../../services/friendProgressWorkflow';
import {
  isManualDistanceSource,
  isSyncedDistanceSource,
  MANUAL_DISTANCE_SOURCES,
} from '../../../constants/distanceSources';
import { resetDistanceData } from '../../../services/distanceDataReset';
import { database } from '../../../services/database';
import { DEFAULT_SAVE_ID } from '../../../constants/gameConstants';
import type { DistanceSource } from '../../../types';

/**
 * DataContent - Content component for the Data modal.
 * Provides options to manage user data: delete synced data,
 * reset settings, and reset all progress.
 */
export default function DataContent() {
  const theme = useTheme();

  const progressMiles = useProgressStore(state => state.miles);
  const committedEntries = useProgressStore(state => state.distanceEntries);
  const [sources, setSources] = useState<DistanceSource[]>([]);
  useEffect(() => {
    let cancelled = false;
    database
      .getDistanceSourcePresence(DEFAULT_SAVE_ID)
      .then(nextSources => {
        if (!cancelled) setSources(nextSources);
      })
      .catch(error => console.error('Failed to load data sources:', error));
    return () => {
      cancelled = true;
    };
  }, [committedEntries, progressMiles]);
  const hasSyncedData = sources.some(isSyncedDistanceSource);
  const hasManualData = sources.some(isManualDistanceSource);
  const hasAnyData = sources.length > 0;
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const sharingProvisioningPending = useSettingsStore(
    state => state.sharingProvisioningPending,
  );
  const sharingDeletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const hasSharedData =
    sharingEnabled || sharingProvisioningPending || sharingDeletionPending;
  const syncIssues = useProgressStore(state => state.syncIssues);
  const clearAllSyncIssues = useProgressStore(
    state => state.clearAllSyncIssues,
  );
  const hasTrackingHistory = syncIssues.length > 0;
  const hasAllData = hasAnyData || hasSharedData || hasTrackingHistory;

  const handleDeleteTrackingHistory = () => {
    Alert.alert(
      'Delete Troubleshooting History',
      'Delete the record of problems we detected? Your journey progress will not be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => clearAllSyncIssues(),
        },
      ],
    );
  };

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
            const syncedSources = [
              ...new Set(sources.filter(isSyncedDistanceSource)),
            ];
            await resetDistanceData({ removeSources: syncedSources });
            setSources(current =>
              current.filter(source => !isSyncedDistanceSource(source)),
            );
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
              .removeDistanceEntriesBySource(MANUAL_DISTANCE_SOURCES);
            setSources(current =>
              current.filter(source => !isManualDistanceSource(source)),
            );
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

            await resetDistanceData({ clearAll: true });
            clearAllSyncIssues();
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
            <StatusBadge label="No data" tone="neutral" />
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
            <StatusBadge label="No data" tone="neutral" />
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
              Delete shared friends data
            </Text>
            <Text style={typographyThemed(theme).captionSecondary}>
              Delete your shared name and distance and turn friend sharing off
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
            <StatusBadge label="No shared data" tone="neutral" />
          )}
        </View>

        {/* Tracking history */}
        <View style={[styles.contentRow]}>
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Delete troubleshooting history
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Remove the record of problems we detected and how they were
              resolved
            </Text>
          </View>
          {hasTrackingHistory ? (
            <Button
              onPress={handleDeleteTrackingHistory}
              variant="outline"
              size="default"
            >
              Delete
            </Button>
          ) : (
            <StatusBadge label="No history" tone="neutral" />
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
              Delete all
            </Button>
          ) : (
            <StatusBadge label="No data" tone="neutral" />
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
