import React from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import { fitnessService } from '../../../services/fitnessService';
import Button from '../../Buttons/Button';
import SectionHeader from '../SectionHeader';
import SettingsRef from '../../SettingsRef';
import { SyncNowRow } from '../../SyncNowRow';
import { PlusIcon } from '../../../assets/icons';

/**
 * SyncContentIOS - iOS-only Sync modal content.
 *
 * Frozen pre-1.1.0 design: single-source Apple Health flow. Pedometer
 * parity is deferred. Do not add Android concepts (trackingMode,
 * pedometer) here — the platform dispatcher in SyncContent.tsx ensures
 * this file is only ever rendered on iOS.
 */
export default function SyncContentIOS() {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const setSyncProvider = useSettingsStore(state => state.setSyncProvider);
  const setSyncStartDate = useSettingsStore(state => state.setSyncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const showSyncNow = syncEnabled && syncProvider !== 'none';

  const [busy, setBusy] = React.useState(false);

  const isHealthAppActive = syncEnabled && syncProvider === 'apple-health';

  const connectHealthApp = async () => {
    setBusy(true);
    try {
      await fitnessService.initialize('apple-health');

      let granted = false;
      try {
        granted = await fitnessService.requestPermissions('apple-health');
      } catch (permError) {
        console.error('Permission request failed:', permError);
        Alert.alert(
          'Setup Required',
          'Please make sure Apple Health is installed and set up on your device before syncing.',
        );
        return;
      }

      if (granted) {
        setSyncProvider('apple-health');
        setSyncStartDate(Date.now());
        setSyncEnabled(true);
        return;
      }

      Alert.alert(
        'Permission Required',
        'Distance tracking requires access to Apple Health. If you previously denied permission, you may need to grant the App permission in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ],
      );
    } catch (error) {
      console.error('Sync setup error:', error);
      Alert.alert(
        'Setup Required',
        'Please make sure Apple Health is installed and set up on your device before syncing.',
      );
    } finally {
      setBusy(false);
    }
  };

  const stopSyncing = async () => {
    setBusy(true);
    try {
      if (syncProvider !== 'none') {
        try {
          await fitnessService.disconnect();
        } catch (error) {
          console.warn('[SyncContentIOS] stop-syncing disconnect:', error);
        }
      }
      setSyncEnabled(false);
      setSyncProvider('none');
      setLastSyncTimestamp(null);
    } finally {
      setBusy(false);
    }
  };

  const handleStopSyncing = () => {
    if (busy) return;
    Alert.alert(
      'Stop syncing?',
      'Miles will only be added manually. You can turn syncing back on anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop syncing', style: 'destructive', onPress: stopSyncing },
      ],
    );
  };

  return (
    <>
      <SectionHeader title="Sync options" />

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
          ✓ You are connected to Apple Health
        </Text>
      )}
      <View style={styles.buttonRow}>
        <Button
          variant={isHealthAppActive ? 'brand' : 'primary'}
          size="default"
          onPress={connectHealthApp}
          disabled={busy || isHealthAppActive}
        >
          Apple Health
        </Button>
        {syncEnabled && (
          <Button
            variant="outline"
            size="default"
            onPress={handleStopSyncing}
            disabled={busy}
          >
            Disconnect
          </Button>
        )}
      </View>
      <Text style={[typographyThemed(theme).captionSecondary, styles.infoText]}>
        You must already have Apple Health set up on your device for syncing to
        work.
      </Text>

      {syncEnabled && showSyncNow && (
        <View style={styles.section}>
          <View
            style={[
              styles.dividerRow,
              { borderTopColor: theme.colors.divider },
            ]}
          >
            <SyncNowRow />
          </View>
          <View
            style={[
              styles.dividerBottom,
              { borderBottomColor: theme.colors.divider },
            ]}
          />
        </View>
      )}

      <View style={styles.approveSection}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Approve data access
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          We request access to distance and step count to calculate your journey
          progress. No other health data is accessed.
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          Connecting your distance and steps is not required to use the app. If
          you prefer to manually add miles, use{' '}
          <View style={styles.inlinePlus}>
            <View style={styles.inlinePlusCircle}>
              <PlusIcon size={8} color="#fff" />
            </View>
          </View>{' '}
          from the map.
        </Text>
      </View>

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Manage synced data
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          You can disable syncing above. Disabling sync does not automatically
          delete your synced data. You can delete synced data at any time from{' '}
          <SettingsRef />.
        </Text>
      </View>

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Revoking access
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          Disconnecting stops the app from syncing your health data. To fully
          revoke access, go to Settings → Health → Middle Earth Challenge and
          turn off all permissions.
        </Text>
      </View>

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
    marginTop: spacing.xl,
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
