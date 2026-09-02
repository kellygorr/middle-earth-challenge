import React from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../stores/settingsStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import Button from '../../Buttons/Button';
import { StatusBadge } from '../../StatusBadge';
import Section from '../Section';
import {
  backupFileName,
  exportJourneyData,
  importJourneyData,
} from '../../../services/journeyDataTransfer';
import { friendProgressWorkflow } from '../../../services/friendProgressWorkflow';

export default function TransferDataContent() {
  const theme = useTheme();
  const [busy, setBusy] = React.useState<'export' | 'import' | null>(null);
  const disabled = busy !== null || Platform.OS !== 'android';
  const fileName = React.useMemo(() => backupFileName(), []);
  const exportedFileName = useSettingsStore(
    state => state.lastJourneyBackupFileName,
  );
  const setLastJourneyBackupFileName = useSettingsStore(
    state => state.setLastJourneyBackupFileName,
  );
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const sharingProvisioningPending = useSettingsStore(
    state => state.sharingProvisioningPending,
  );
  const sharingDeletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const hasSharedData =
    sharingEnabled || sharingProvisioningPending || sharingDeletionPending;

  const performExport = async () => {
    setBusy('export');
    try {
      const savedFileName = await exportJourneyData();
      if (savedFileName) {
        await setLastJourneyBackupFileName(savedFileName);
        if (hasSharedData) {
          try {
            if (sharingDeletionPending) {
              await friendProgressWorkflow.retryPendingDeletion();
            } else {
              await friendProgressWorkflow.disableSharing();
            }
          } catch {
            Alert.alert(
              'Export Complete',
              `Your backup was saved as ${savedFileName}.\n\nFriend sharing is off, but cloud cleanup is still pending.`,
            );
            return;
          }
        }
        Alert.alert(
          'Export Complete',
          `Your backup was saved as ${savedFileName}.`,
        );
      }
    } catch (error) {
      Alert.alert(
        'Export Failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleExport = () => {
    Alert.alert(
      'Export Backup?',
      hasSharedData
        ? 'Exporting saves your journey to a backup file and disconnects friend sharing on this phone. You can turn sharing back on after importing on your new phone.'
        : 'Exporting saves your journey to a backup file.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: performExport },
      ],
    );
  };

  const handleImport = () => {
    Alert.alert(
      'Import Data?',
      'Importing replaces local journey data and app preferences from the backup file. Current health permissions, pedometer access, and friend sharing stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setBusy('import');
            try {
              const imported = await importJourneyData();
              if (imported) {
                Alert.alert(
                  'Import Complete',
                  'Journey data and app preferences were restored.',
                );
              }
            } catch (error) {
              Alert.alert(
                'Import Failed',
                error instanceof Error ? error.message : String(error),
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Section>
        <Text style={typographyThemed(theme).captionSecondary}>
          Export a backup of your journey, then import it on a new device.
        </Text>
      </Section>

      <Section>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Move data to new phone
        </Text>
        <View
          style={[
            styles.contentRow,
          ]}
        >
          <View style={styles.flex1}>
            <Text style={typographyThemed(theme).bodyPrimary}>
              Export backup
            </Text>
            <Text style={typographyThemed(theme).captionSecondary}>
              {hasSharedData
                ? 'Save your local journey data. This will disconnect friend sharing (it can be re-enabled on the new phone)'
                : 'Save your local journey data to a file'}
            </Text>
          </View>
          <Button
            onPress={handleExport}
            variant="outline"
            size="default"
            disabled={disabled}
          >
            {busy === 'export' ? 'Exporting' : 'Export'}
          </Button>
        </View>

        <View
          style={[
            styles.fileNameRow,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={typographyThemed(theme).captionSecondary}>
            Last export:
          </Text>
          <StatusBadge
            label={exportedFileName ?? fileName}
            style={styles.fileNameBadge}
          />
        </View>

        <View style={styles.contentRow}>
          <View style={styles.flex1}>
            <Text style={typographyThemed(theme).bodyPrimary}>
              Import backup
            </Text>
            <Text style={typographyThemed(theme).captionSecondary}>
              Replace journey data and preferences from a backup file
            </Text>
          </View>
          <Button
            onPress={handleImport}
            variant="outline"
            size="default"
            disabled={disabled}
          >
            {busy === 'import' ? 'Importing' : 'Import'}
          </Button>
        </View>
      </Section>

      {Platform.OS !== 'android' && (
        <Section>
          <Text style={typographyThemed(theme).captionSecondary}>
            Data transfer is currently available on Android.
          </Text>
        </Section>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  sectionLabel: {
    fontWeight: '600',
    marginBottom: spacing.sm,
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
  fileNameRow: {
    alignItems: 'flex-start',
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  fileNameBadge: {
    maxWidth: '100%',
    flexShrink: 1,
  },
});
