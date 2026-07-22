import React from 'react';
import { View, Text, StyleSheet, Platform, Alert, Linking } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import { SyncProvider } from '../../../types';
import { fitnessService } from '../../../services/fitnessService';
import Button from '../../Buttons/Button';
import SectionHeader from '../SectionHeader';
import ToggleRow from '../ToggleRow';
import SettingsRef from '../../SettingsRef';
import { SyncNowRow } from '../../SyncNowRow';
import { PlusIcon } from '../../../assets/icons';

interface SyncOption {
  id: SyncProvider;
  name: string;
  description: string;
  available: boolean;
}

/**
 * SyncContent - Content component for the Sync modal.
 * Extracted from SyncModal for use with SharedModal.
 */
export default function SyncContent() {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const setSyncProvider = useSettingsStore(state => state.setSyncProvider);
  const setSyncStartDate = useSettingsStore(state => state.setSyncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );
  const miles = useProgressStore(state => state.miles) || 0;
  // SyncNowRow hides itself until the user has miles (see its own guard).
  // Mirror that here so the wrapper's top border doesn't stack against the
  // Live sync row's top border and create a double line.
  const showSyncNow = syncEnabled && miles > 0;

  const handleDisconnect = async () => {
    await fitnessService.disconnect();
    setSyncEnabled(false);
    setSyncProvider('none');
    setLastSyncTimestamp(null); // Clear so reconnect starts fresh
  };

  // Define available sync options based on platform
  const syncOptions: SyncOption[] = React.useMemo(() => {
    if (Platform.OS === 'ios') {
      return [
        {
          id: 'apple-health',
          name: 'Apple Health',
          description: 'Sync walking and running distance from Apple Health',
          available: true,
        },
      ];
    } else {
      return [
        {
          id: 'health-connect',
          name: 'Health Connect',
          description: 'Sync from multiple apps via Health Connect',
          available: true,
        },
      ];
    }
  }, []);

  const handleSelectProvider = async (provider: SyncProvider) => {
    // For Health Connect, check SDK availability first
    if (provider === 'health-connect') {
      try {
        const sdkStatus = await fitnessService.checkSdkStatus();

        if (sdkStatus.status === 'unavailable') {
          Alert.alert(
            'Health Connect Required',
            'Health Connect is not installed on your device. Would you like to install it from the Play Store?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Install',
                onPress: () => {
                  Linking.openURL(
                    'market://details?id=com.google.android.apps.healthdata',
                  );
                },
              },
            ],
          );
          return;
        }

        if (sdkStatus.status === 'update_required') {
          Alert.alert(
            'Update Required',
            'Health Connect needs to be updated. Would you like to update it from the Play Store?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Update',
                onPress: () => {
                  Linking.openURL(
                    'market://details?id=com.google.android.apps.healthdata',
                  );
                },
              },
            ],
          );
          return;
        }

        // SDK is available, proceed with sync
        attemptSync(provider);
      } catch (error) {
        console.error('Error checking Health Connect status:', error);
        Alert.alert(
          'Health Connect Required',
          'Health Connect is not available on your device. Would you like to install it from the Play Store?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Install',
              onPress: () => {
                Linking.openURL(
                  'market://details?id=com.google.android.apps.healthdata',
                );
              },
            },
          ],
        );
      }
      return;
    }

    // For other providers, proceed directly
    attemptSync(provider);
  };

  const attemptSync = async (provider: SyncProvider) => {
    try {
      // Initialize the fitness service with the selected provider
      await fitnessService.initialize(provider);

      let granted = false;
      try {
        granted = await fitnessService.requestPermissions(provider);
      } catch (permError) {
        console.error('Permission request failed:', permError);
        Alert.alert(
          'Setup Required',
          `Please make sure ${
            provider === 'health-connect' ? 'Health Connect' : 'Apple Health'
          } is installed and set up on your device before syncing.`,
        );
        return;
      }

      if (granted) {
        setSyncProvider(provider);
        setSyncStartDate(Date.now());
        setSyncEnabled(true);
        // Don't auto-dismiss - let user see connected state and dismiss manually
      } else {
        const providerName =
          provider === 'health-connect' ? 'Health Connect' : 'Apple Health';
        Alert.alert(
          'Permission Required',
          `Distance tracking requires access to ${providerName}. If you previously denied permission, you may need to grant the App permission in Settings.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (provider === 'health-connect') {
                  // Open Health Connect app settings
                  Linking.openURL(
                    'market://details?id=com.google.android.apps.healthdata',
                  );
                } else {
                  // Open app settings
                  Linking.openSettings();
                }
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Sync setup error:', error);
      Alert.alert(
        'Setup Required',
        'Please make sure the fitness app is installed and set up on your device before syncing.',
      );
    }
  };

  return (
    <>
      <SectionHeader title="Sync options" />

      <View style={styles.approveSection}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Approve data access
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          We request access to distance and step count to calculate your
          journey progress. No other health data is accessed.
        </Text>
        <Text
          style={[
            typographyThemed(theme).captionSecondary,
            styles.sectionText,
          ]}
        >
          Connecting your distance and steps is not required to use the app.
          If you prefer to manually add miles, use{' '}
          <View style={styles.inlinePlus}>
            <View style={styles.inlinePlusCircle}>
              <PlusIcon size={8} color="#fff" />
            </View>
          </View>{' '}
          from the map.
        </Text>
      </View>

      {syncEnabled && (
        <Text
          style={[
            typographyThemed(theme).bodyPrimary,
            styles.connectedMessage,
            {
              backgroundColor: theme.colors.successBg,
              color: theme.colors.successText,
            },
          ]}
        >
          ✓ You are connected to{' '}
          {syncProvider === 'health-connect'
            ? 'Health Connect'
            : syncProvider === 'apple-health'
            ? 'Apple Health'
            : 'a health app'}
        </Text>
      )}

      <View style={styles.buttonRow}>
        {syncOptions.map(option => (
          <Button
            key={option.id}
            variant={
              syncEnabled && syncProvider === option.id ? 'brand' : 'primary'
            }
            size="default"
            onPress={() => handleSelectProvider(option.id)}
            disabled={syncEnabled && syncProvider === option.id}
          >
            {option.name}
          </Button>
        ))}
        {syncEnabled && (
          <Button variant="outline" size="default" onPress={handleDisconnect}>
            Disconnect
          </Button>
        )}
      </View>

      <Text style={[typographyThemed(theme).captionSecondary, styles.infoText]}>
        {Platform.OS === 'ios'
          ? 'You must already have Apple Health set up on your device for syncing to work.'
          : 'Health Connect is built into Android 14+ or can be installed from the Play Store.'}
      </Text>

      {syncEnabled && (
        <View style={styles.section}>
          {showSyncNow && (
            <View
              style={[
                styles.dividerRow,
                { borderTopColor: theme.colors.divider },
              ]}
            >
              <SyncNowRow />
            </View>
          )}
          <View
            style={[
              styles.dividerRow,
              { borderTopColor: theme.colors.divider },
            ]}
          >
            <ToggleRow
              label="Live sync"
              caption="See your progress update in real-time in this app"
              value={liveSyncEnabled}
              onValueChange={setLiveSyncEnabled}
            />
          </View>
          <View
            style={[
              styles.dividerBottom,
              { borderBottomColor: theme.colors.divider },
            ]}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Manage syncing
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          You can disable syncing above. Disabling sync does not automatically
          delete your synced data. You can delete synced data at any time from{' '}
          <SettingsRef />.
        </Text>
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.section}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Revoking access
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            When revoking sync access, permissions are removed after app
            restart. This is a limitation of the Health Connect API.
          </Text>
        </View>
      )}

      {Platform.OS === 'ios' && (
        <View style={styles.section}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Revoking access
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            Disconnecting stops the app from syncing your health data. To fully
            revoke access, go to Settings → Health → Middle Earth Challenge and
            turn off all permissions.
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Data use
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          Your distance data is stored locally on your device and is only used
          to calculate your journey progress. No data is sent to external
          servers.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  infoText: {
    textAlign: 'left',
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
  },
  approveSection: {
    marginTop: spacing.sm,
  },
  // Outer wrapper is the same 14px size as the SettingsIcon in SettingsRef
  // so both inline refs sit at the same spot on the text line. The inner
  // circle is smaller (12px) to visually match the gear's lighter weight.
  inlinePlus: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 2 }],
  },
  inlinePlusCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    borderTopWidth: 1,
  },
  dividerBottom: {
    borderBottomWidth: 1,
  },
  sectionLabel: {
    textAlign: 'left',
    fontWeight: '600',
  },
  sectionText: {
    textAlign: 'left',
    marginTop: spacing.xs,
  },
  connectedMessage: {
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
