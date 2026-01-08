import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import { modalStyles } from '../../../styles/modalStyles';
import { SyncProvider } from '../../../types';
import { fitnessService } from '../../../services/fitnessService';
import Button from '../../Buttons/Button';
import SectionHeader from '../../UI/SectionHeader';
import ToggleRow from '../../UI/ToggleRow';

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
    console.log('handleSelectProvider called with:', provider);

    // For Health Connect, check SDK availability first
    if (provider === 'health-connect') {
      try {
        const sdkStatus = await fitnessService.checkSdkStatus();
        console.log('Health Connect SDK status:', sdkStatus);

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
      console.log('Initializing fitness service...');
      await fitnessService.initialize(provider);
      console.log('Fitness service initialized, requesting permissions...');

      let granted = false;
      try {
        granted = await fitnessService.requestPermissions(provider);
        console.log('Permission result:', granted);
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

      console.log('Permission granted:', granted);

      if (granted) {
        console.log('Setting sync provider...');
        setSyncProvider(provider);
        setSyncStartDate(Date.now());
        setSyncEnabled(true);
        // Don't auto-dismiss - let user see connected state and dismiss manually
      } else {
        console.log('Permission denied, showing alert...');
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
    <ScrollView
      style={modalStyles.scrollView}
      contentContainerStyle={[modalStyles.scrollContent, styles.container]}
      showsVerticalScrollIndicator={false}
      bounces={true}
    >
      <SectionHeader title="Sync options" />

      {syncEnabled && (
        <Text
          style={[
            typographyThemed(theme).bodyPrimary,
            styles.connectedMessage,
            {
              backgroundColor: theme.colors.buttonDisabledBg,
              color: theme.colors.buttonBrandText,
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

      <View style={styles.section}>
        <ToggleRow
          label="Live sync"
          caption="See your progress update in real-time"
          value={liveSyncEnabled}
          onValueChange={setLiveSyncEnabled}
        />
      </View>

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Manage syncing
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          You can disable syncing or delete synced data at any time from the
          Settings menu.
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
          to track your journey progress. No data is sent to external servers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
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
