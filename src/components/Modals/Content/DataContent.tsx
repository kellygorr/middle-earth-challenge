import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, borderRadius } from '../../../styles/global';
import { database } from '../../../services/database';
import Button from '../../Buttons/Button';
import SectionHeader from '../SectionHeader';
import Section from '../Section';

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

  // Delete synced data only
  const handleDeleteSyncedData = async () => {
    Alert.alert(
      'Delete Synced Data',
      'Are you sure you want to delete all synced data? This cannot be undone. If you are still connected to the health app, future syncs will only import new data from this point forward. Your manually entered data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const syncedEntries = distanceEntries.filter(
              e => e.source !== 'manual',
            );
            const totalToRemove = syncedEntries.reduce(
              (sum, e) => sum + (e?.miles ?? 0),
              0,
            );

            // Remove from store and database
            for (const entry of syncedEntries) {
              useProgressStore.getState().removeDistanceEntry(entry.id);
              try {
                await database.removeDistanceEntry(entry.id);
              } catch (err) {
                console.warn('Failed to remove synced entry:', err);
              }
            }

            // Update miles total
            const currentMiles = useProgressStore.getState().miles ?? 0;
            const newMiles = Math.max(0, currentMiles - totalToRemove);
            useProgressStore.getState().setMiles(newMiles);
            try {
              await database.setMilesSnapshot('default', newMiles);
            } catch (err) {
              console.warn('Failed to update miles snapshot:', err);
            }

            // Reset sync start date to now so deleted data isn't re-imported
            useSettingsStore.getState().setSyncStartDate(Date.now());
          },
        },
      ],
    );
  };

  // Delete manual data only
  const handleDeleteManualData = async () => {
    Alert.alert(
      'Delete Manual Data',
      'Are you sure you want to delete all manually entered data? This cannot be undone. Your synced data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const manualEntries = distanceEntries.filter(
              e => e.source === 'manual',
            );
            const totalToRemove = manualEntries.reduce(
              (sum, e) => sum + (e?.miles ?? 0),
              0,
            );

            // Remove from store and database
            for (const entry of manualEntries) {
              useProgressStore.getState().removeDistanceEntry(entry.id);
              try {
                await database.removeDistanceEntry(entry.id);
              } catch (err) {
                console.warn('Failed to remove manual entry:', err);
              }
            }

            // Update miles total
            const currentMiles = useProgressStore.getState().miles ?? 0;
            const newMiles = Math.max(0, currentMiles - totalToRemove);
            useProgressStore.getState().setMiles(newMiles);
            try {
              await database.setMilesSnapshot('default', newMiles);
            } catch (err) {
              console.warn('Failed to update miles snapshot:', err);
            }
          },
        },
      ],
    );
  };

  // Delete all distance data (synced + manual)
  const handleDeleteAllProgress = async () => {
    Alert.alert(
      'Delete All Progress',
      'Are you sure you want to delete ALL your journey progress? This includes both synced and manually entered data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            // Remove all entries from store and database
            for (const entry of distanceEntries) {
              useProgressStore.getState().removeDistanceEntry(entry.id);
              try {
                await database.removeDistanceEntry(entry.id);
              } catch (err) {
                console.warn('Failed to remove entry:', err);
              }
            }

            // Reset miles to 0
            useProgressStore.getState().setMiles(0);
            try {
              await database.setMilesSnapshot('default', 0);
            } catch (err) {
              console.warn('Failed to reset miles snapshot:', err);
            }
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
            store.setLabelSize('regular');
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
        <SectionHeader title="Data" />

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
              Remove all data synced from health app. This does not disconnect
              syncing.
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
                { backgroundColor: theme.colors.successBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.successText },
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
              Remove all manually entered entries
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
                { backgroundColor: theme.colors.successBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.successText },
                ]}
              >
                No data
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
              Remove all manual and synced data
            </Text>
          </View>
          {hasAnyData ? (
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
                { backgroundColor: theme.colors.successBg },
              ]}
            >
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { color: theme.colors.successText },
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
