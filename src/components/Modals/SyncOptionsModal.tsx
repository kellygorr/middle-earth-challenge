import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  Switch,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';
import { modalStyles } from '../../styles/modalStyles';
import ModalWrapper from './ModalWrapper';
import { SyncProvider } from '../../types';
import { fitnessService } from '../../services/fitnessService';
import Button from '../Buttons/Button';
import {
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

interface SyncOption {
  id: SyncProvider;
  name: string;
  description: string;
  available: boolean;
}

interface SyncOptionsModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSyncEnabled?: () => void;
}

export default function SyncOptionsModal({
  visible,
  onDismiss,
  onSyncEnabled,
}: SyncOptionsModalProps) {
  const theme = useTheme();
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const setSyncProvider = useSettingsStore(state => state.setSyncProvider);
  const setSyncStartDate = useSettingsStore(state => state.setSyncStartDate);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );

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

    // For Health Connect, check SDK availability first using the library's method
    if (provider === 'health-connect') {
      try {
        const status = await getSdkStatus();
        console.log('Health Connect SDK status:', status);

        if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) {
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

        if (
          status ===
          SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        ) {
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
        console.log('Setting sync provider and closing modal...');
        setSyncProvider(provider);
        setSyncStartDate(Date.now());
        setSyncEnabled(true);
        onDismiss();
        onSyncEnabled?.();
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
    <ModalWrapper
      visible={visible}
      onDismiss={onDismiss}
      title={Platform.OS === 'ios' ? 'iOS' : 'Android'}
    >
      <View style={[modalStyles.scrollContent, styles.container]}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            modalStyles.sectionTitle,
          ]}
        >
          Sync options
        </Text>

        <View style={styles.buttonRow}>
          {syncOptions.map(option => (
            <Button
              key={option.id}
              variant="primary"
              size="default"
              onPress={() => handleSelectProvider(option.id)}
            >
              {option.name}
            </Button>
          ))}
        </View>

        <Text
          style={[typographyThemed(theme).captionSecondary, styles.infoText]}
        >
          {Platform.OS === 'ios'
            ? 'You must already have Apple Health set up on your device for syncing to work.'
            : 'Health Connect is built into Android 14+ or can be installed from the Play Store.'}
        </Text>

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  styles.sectionLabel,
                ]}
              >
                {`Live sync (${liveSyncEnabled ? 'enabled' : 'disabled'})`}
              </Text>
              <Text
                style={[
                  typographyThemed(theme).captionSecondary,
                  styles.sectionText,
                  { marginTop: spacing.xs },
                ]}
              >
                Enable this when exercising with the app open to see your
                progress update in real-time.
              </Text>
            </View>
            <Switch
              value={liveSyncEnabled}
              onValueChange={setLiveSyncEnabled}
              trackColor={{
                false: theme.colors.switchInactive,
                true: theme.colors.buttonPrimary,
              }}
              thumbColor={theme.colors.surface}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Manage syncing
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            You can disable syncing or delete synced data at any time from the
            Settings menu.
            {Platform.OS === 'android' &&
              ' When revoking sync access, permissions are removed after app restart. This is a limitation of the Health Connect API.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Data use
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            Your distance data is stored locally on your device and is only used
            to track your journey progress. No data is sent to external servers.
          </Text>
        </View>
      </View>
    </ModalWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  description: {
    marginBottom: spacing.lg,
    textAlign: 'center',
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  boldText: {
    fontWeight: '600',
  },
});
