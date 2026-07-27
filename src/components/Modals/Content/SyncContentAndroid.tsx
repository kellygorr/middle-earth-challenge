import React from 'react';
import { View, Text, StyleSheet, Alert, Linking, AppState } from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing } from '../../../styles/global';
import { fitnessService } from '../../../services/fitnessService';
import { pedometerService } from '../../../services/pedometerService';
import { switchTrackingMode } from '../../../services/trackingModeService';
import { commitPedometerRange } from '../../../services/pedometerCommit';
import Button from '../../Buttons/Button';
import SectionHeader from '../SectionHeader';
import RadioRow from '../RadioRow';
import AccessExpander, { AccessItem } from '../AccessExpander';
import SettingsRef from '../../SettingsRef';
import { SyncNowRow } from '../../SyncNowRow';
import { PlusIcon } from '../../../assets/icons';
import {
  isOemBatteryOffender,
  isOemBatteryDevPreview,
  getOemBatteryPromptCopy,
} from '../../../utils/oemBattery';

/**
 * SyncContentAndroid - Android-only Sync modal content.
 *
 * Two-source flow with a radio picker (Pedometer / Health Connect).
 * Radios are unfilled on first install — the user must actively opt in.
 *
 * State model:
 * - syncEnabled=false, any trackingMode: no source active (manual entry
 *   only). Initial state; trackingMode is preserved as the last
 *   preference so re-enabling remembers.
 * - syncEnabled=true, trackingMode='health-app', syncProvider set:
 *   Health Connect active.
 * - syncEnabled=true, trackingMode='pedometer', syncProvider='none':
 *   Pedometer active.
 */
export default function SyncContentAndroid() {
  const theme = useTheme();
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const setSyncProvider = useSettingsStore(state => state.setSyncProvider);
  const setSyncStartDate = useSettingsStore(state => state.setSyncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const hasSeenOemBatteryPrompt = useSettingsStore(
    state => state.hasSeenOemBatteryPrompt,
  );
  const setHasSeenOemBatteryPrompt = useSettingsStore(
    state => state.setHasSeenOemBatteryPrompt,
  );
  // Persisted so the ↻ indicator + revoked banner survive modal close
  // / JS reload — the underlying HC lie also survives them, so a
  // session-scoped flag would drop back to a false ✓ the next time the
  // user peeks at Required Access. Cleared automatically by
  // refreshGrantedState once HC actually reports revoked.
  const hcRevokePendingRestart = useSettingsStore(
    state => state.hcRevokePendingRestart,
  );
  const setHcRevokePendingRestart = useSettingsStore(
    state => state.setHcRevokePendingRestart,
  );
  const miles = useProgressStore(state => state.miles) || 0;
  const showSyncNow = syncEnabled && miles > 0;

  // Local guard against tapping multiple radios / stop while a source
  // switch is mid-flight. React state so it can disable the rows.
  const [busy, setBusy] = React.useState(false);

  // Whether the OS has granted us the runtime access each source
  // needs. Independent of whether that source is currently *active* —
  // permissions persist across stopSyncing until explicitly revoked.
  // Drives the visibility of the per-source blocks in the Revoke
  // access section (no grant → no block).
  const [pedometerGranted, setPedometerGranted] = React.useState(false);
  const [hcGranted, setHcGranted] = React.useState(false);

  // Lowercase manufacturer string from Build.MANUFACTURER, cached from
  // the same getEnvironment() call that drives pedometerGranted. Used
  // to decide whether to add the "Battery settings" bullet to the
  // pedometer radio's Required Access list (Samsung / Xiaomi / Huawei /
  // OnePlus / Oppo / Realme / Vivo). Empty string until the first env
  // fetch resolves — isOemBatteryOffender('') returns false, so the
  // bullet stays hidden during that window.
  const [manufacturer, setManufacturer] = React.useState('');
  const oemBatteryAffected = React.useMemo(
    () => isOemBatteryOffender(manufacturer),
    [manufacturer],
  );
  // On Pixel/stock Android in dev builds the affected bullet + prompt
  // are shown for previewability only; tag them so it's obvious in the
  // UI that this row wouldn't ship to real Pixel users.
  const oemBatteryDevPreview = React.useMemo(
    () => isOemBatteryDevPreview(manufacturer),
    [manufacturer],
  );

  // Per-item status for the Required Access checklist. All false
  // until the first getEnvironment() / getHealthConnectGrants()
  // resolves, which is fine — the picker itself doesn't depend on
  // these, only the expander bullet prefixes do.
  const [permStatus, setPermStatus] = React.useState({
    activityRecognition: false,
    postNotifications: false,
    ignoresBatteryOptimizations: false,
    pedometerServiceRunning: false,
    hcSteps: false,
    hcDistance: false,
  });

  // Set true after the user taps Revoke Health Connect access in this
  // session. The block stays visible (HC keeps reporting the old grants
  // until the app restarts) but we swap the button for a confirmation
  // banner so the user knows the revoke landed. Naturally clears on
  // next launch when the component remounts.
  // Superseded by the persisted `hcRevokePendingRestart` above; kept
  // as a local alias for readability of the JSX that references it.
  const hcSessionRevoked = hcRevokePendingRestart;

  // Refreshes ONLY the local per-source permission flags used to gate
  // the Revoke-access blocks. Deliberately does not touch `syncEnabled`
  // or `syncProvider` — all store reconciliation lives in
  // `ensureTrackingModeRunning` (called on cold boot + AppState.active
  // from App.tsx) so we have one source of truth. Earlier versions
  // reconciled here too and spuriously flipped `syncEnabled` off
  // whenever `getEnvironment()` threw or the native module wasn't
  // ready yet.
  const refreshGrantedState = React.useCallback(async () => {
    try {
      if (pedometerService.isSupported()) {
        const env = await pedometerService.getEnvironment();
        setPedometerGranted(!!env.activityRecognition);
        setManufacturer(env.manufacturer || '');
        // Foreground-service running → Android is actively letting us
        // work in the background right now. Treat that as sufficient
        // for the "Background activity" checklist item even if the
        // battery-optimization allowlist bit hasn't been flipped:
        // many users tracking successfully never grant that runtime
        // permission and it was confusing to see ○ next to a source
        // that was clearly working.
        let serviceRunning = false;
        try {
          serviceRunning = await pedometerService.isServiceRunning();
        } catch {
          serviceRunning = false;
        }
        setPermStatus(prev => ({
          ...prev,
          activityRecognition: !!env.activityRecognition,
          postNotifications: !!env.postNotifications,
          ignoresBatteryOptimizations: !!env.ignoresBatteryOptimizations,
          pedometerServiceRunning: serviceRunning,
        }));
      } else {
        setPedometerGranted(false);
      }
    } catch (error) {
      console.warn('[SyncContentAndroid] refresh pedometer permission:', error);
    }
    try {
      const hasHc = await fitnessService.hasHealthConnectPermissions();
      setHcGranted(hasHc);
      const grants = await fitnessService.getHealthConnectGrants();
      setPermStatus(prev => ({
        ...prev,
        hcSteps: grants.steps,
        hcDistance: grants.distance,
      }));
      // If we're waiting on the app to restart after a revoke and HC
      // has finally caught up (both grants reporting false), clear the
      // flag so the checklist stops nagging with ↻. Any lingering
      // grant means the restart hasn't happened yet — leave the flag
      // alone.
      if (hcRevokePendingRestart && !grants.steps && !grants.distance) {
        setHcRevokePendingRestart(false);
      }
    } catch (error) {
      console.warn('[SyncContentAndroid] refresh HC permission:', error);
    }
  }, [hcRevokePendingRestart, setHcRevokePendingRestart]);

  // Initial load + re-check on foreground return (user may have
  // toggled a permission in Settings while we were backgrounded).
  React.useEffect(() => {
    refreshGrantedState();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshGrantedState();
    });
    return () => sub.remove();
  }, [refreshGrantedState]);

  const isHealthAppActive =
    syncEnabled && trackingMode === 'health-app' && syncProvider !== 'none';
  const isPedometerActive = syncEnabled && trackingMode === 'pedometer';

  // Try to obtain Health Connect sync permission. Sets the sync
  // bookkeeping on success. Returns true if the caller can proceed.
  const attemptHealthConnectSync = async (): Promise<boolean> => {
    try {
      await fitnessService.initialize('health-connect');

      let granted = false;
      try {
        granted = await fitnessService.requestPermissions('health-connect');
      } catch (permError) {
        console.error('Permission request failed:', permError);
        Alert.alert(
          'Setup Required',
          'Please make sure Health Connect is installed and set up on your device before syncing.',
        );
        return false;
      }

      if (granted) {
        setSyncProvider('health-connect');
        setSyncStartDate(Date.now());
        setSyncEnabled(true);
        // Fresh grant clears any earlier in-session revoke banner.
        setHcRevokePendingRestart(false);
        setHcGranted(true);
        return true;
      }

      Alert.alert(
        'Permission Required',
        'Distance tracking requires access to Health Connect. If you previously denied permission, you may need to grant the App permission in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openURL(
                'market://details?id=com.google.android.apps.healthdata',
              );
            },
          },
        ],
      );
      return false;
    } catch (error) {
      console.error('Sync setup error:', error);
      Alert.alert(
        'Setup Required',
        'Please make sure Health Connect is installed and set up on your device before syncing.',
      );
      return false;
    }
  };

  // Check Health Connect SDK availability and prompt install/update if
  // missing. Returns true if OK to proceed with attemptHealthConnectSync.
  const ensureHealthConnectAvailable = async (): Promise<boolean> => {
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
        return false;
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
        return false;
      }
      return true;
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
      return false;
    }
  };

  // Connect Health Connect (fresh or switching from pedometer). If
  // switching from pedometer we also flip trackingMode via
  // switchTrackingMode so a stale 'pedometer' mode doesn't linger. The
  // watermark reset inside switchTrackingMode is safe here because
  // health-app sync uses syncStartDate (just set by
  // attemptHealthConnectSync) as its anchor when lastSyncTimestamp is
  // null.
  const connectHealthApp = async () => {
    setBusy(true);
    try {
      const ok = await ensureHealthConnectAvailable();
      if (!ok) return;
      const connected = await attemptHealthConnectSync();
      if (connected && trackingMode === 'pedometer') {
        await switchTrackingMode('health-app');
      }
    } finally {
      setBusy(false);
    }
  };

  // Start pedometer tracking (fresh or switching from health-app).
  const connectPedometer = async () => {
    setBusy(true);
    try {
      // Disconnect health-app if currently connected. Errors are logged
      // but not surfaced — the switch should proceed even if disconnect
      // fails, because we can only run one source at a time.
      if (syncProvider !== 'none') {
        try {
          await fitnessService.disconnect();
        } catch (error) {
          console.warn(
            '[SyncContentAndroid] pre-switch fitness disconnect:',
            error,
          );
        }
        setSyncProvider('none');
      }

      const result = await switchTrackingMode('pedometer');
      if (result.tracking) {
        setSyncEnabled(true);
        setPedometerGranted(true);

        // OEM battery follow-up (Samsung / Xiaomi / Huawei / OnePlus /
        // Oppo / Realme / Vivo). Presented as the next step in the same
        // permission sequence — the stock Android battery-opt dialog
        // fired inside switchTrackingMode covers Doze, but on these
        // OEMs the manufacturer's own battery manager will still kill
        // the FGS unless the user allow-lists us in their proprietary
        // settings screen. Shown at most once (persisted flag) so it
        // doesn't nag; discoverable afterwards via the "Battery
        // settings" bullet in Required Access.
        try {
          const env = await pedometerService.getEnvironment();
          const copy = getOemBatteryPromptCopy(env.manufacturer);
          if (copy && !hasSeenOemBatteryPrompt) {
            Alert.alert(copy.title, copy.body, [
              {
                text: 'Not now',
                style: 'cancel',
                onPress: () => setHasSeenOemBatteryPrompt(true),
              },
              {
                text: 'Open settings',
                onPress: () => {
                  setHasSeenOemBatteryPrompt(true);
                  pedometerService.openOemBatterySettings().catch(err => {
                    console.warn(
                      '[SyncContentAndroid] openOemBatterySettings:',
                      err,
                    );
                  });
                },
              },
            ]);
          }
        } catch (error) {
          console.warn(
            '[SyncContentAndroid] OEM battery follow-up prompt:',
            error,
          );
        }

        return;
      }

      // Failed to start — usually denied ACTIVITY_RECOGNITION.
      setSyncEnabled(false);
      const permissionDenied =
        result.permissions && !result.permissions.activityRecognition;
      Alert.alert(
        permissionDenied ? 'Permission Required' : 'Could not start pedometer',
        permissionDenied
          ? 'Pedometer needs the Physical activity permission to count steps. You can grant it in Settings.'
          : 'Something went wrong starting the pedometer. Please try again.',
        permissionDenied
          ? [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings();
                },
              },
            ]
          : [{ text: 'OK' }],
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSelectHealthApp = () => {
    if (busy) return;
    if (isHealthAppActive) {
      // Tap the currently-active source to toggle it off. Just stop
      // syncing in-app; permissions remain until explicitly revoked
      // from the Revoke access section below.
      stopSyncing();
      return;
    }
    // Switch directly, whether coming from pedometer or a fresh connect.
    // We used to interrupt cross-source switches with a "Switch to X?"
    // confirmation, but that's noise: the user just tapped the target
    // radio, and if they don't want to grant Health Connect access
    // they'll say no to the permission prompt that follows.
    connectHealthApp();
  };

  const handleSelectPedometer = () => {
    if (busy) return;
    if (isPedometerActive) {
      // Tap the currently-active source to toggle it off. See note above.
      stopSyncing();
      return;
    }
    // Switch directly \u2014 same reasoning as handleSelectHealthApp.
    connectPedometer();
  };

  // Turn off tracking entirely — back to manual-entry-only. Preserves
  // trackingMode so re-enabling later starts on the user's last choice.
  const stopSyncing = async () => {
    setBusy(true);
    try {
      if (syncProvider !== 'none') {
        try {
          await fitnessService.disconnect();
        } catch (error) {
          console.warn(
            '[SyncContentAndroid] stop-syncing fitness disconnect:',
            error,
          );
        }
      }
      if (trackingMode === 'pedometer' && pedometerService.isSupported()) {
        const { lastSyncTimestamp } = useSettingsStore.getState();
        if (lastSyncTimestamp) {
          try {
            await commitPedometerRange(lastSyncTimestamp, Date.now());
          } catch (error) {
            console.warn(
              '[SyncContentAndroid] stop-syncing pedometer flush:',
              error,
            );
          }
        }
        try {
          await pedometerService.stopTracking();
        } catch (error) {
          console.warn(
            '[SyncContentAndroid] stop-syncing pedometer stop:',
            error,
          );
        }
      }
      setSyncEnabled(false);
      setSyncProvider('none');
      setLastSyncTimestamp(null);
    } finally {
      setBusy(false);
    }
  };

  // Revoke Health Connect access via the HC API. The section copy and
  // the post-revoke banner both explain the restart caveat, so the
  // alert stays direct.
  const handleRevokeHealthConnect = () => {
    if (busy) return;
    Alert.alert(
      'Revoke Health Connect access?',
      'You can grant access again anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke access',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await fitnessService.revokePermissions();
              // HC will keep reporting the grants until process
              // restart, so we flip a persisted flag that swaps the
              // button for a confirmation banner and repaints the
              // Required Access items with ↻ in the meantime.
              setHcRevokePendingRestart(true);
            } catch (error) {
              console.warn(
                '[SyncContentAndroid] revoke HC permissions:',
                error,
              );
            } finally {
              setBusy(false);
            }
            if (isHealthAppActive) {
              // If HC is the active source, also stop syncing so app
              // state matches the (soon-to-be) revoked permission.
              stopSyncing();
            }
          },
        },
      ],
    );
  };

  // Pedometer permissions can only be revoked from Android system
  // Settings. Just deep-link there.
  const handleRevokePedometer = () => {
    Linking.openSettings();
  };

  return (
    <>
      <SectionHeader title="Sync options" />

      <View style={styles.pickerSection}>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.introText]}
        >
          Connecting is not required — you can add miles manually using{' '}
          <View style={styles.inlinePlus}>
            <View style={styles.inlinePlusCircle}>
              <PlusIcon size={8} color="#fff" />
            </View>
          </View>{' '}
          from the map.
        </Text>
        <Text
          style={[
            typographyThemed(theme).captionPrimary,
            styles.sectionLabel,
            styles.chooseSourceLabel,
          ]}
        >
          Choose your source
        </Text>
        <Text
          style={[
            typographyThemed(theme).captionSecondary,
            styles.chooseSourceHelp,
          ]}
        >
          Selecting an option will prompt you to approve the required access.
        </Text>
        <View style={styles.pickerRows}>
          <RadioRow
            label="Pedometer"
            description={
              <>
                Uses your phone's built-in step counter{'\n'}
                Lightweight background tracking — counts steps even when the app
                is closed, without draining your battery{'\n'}
                <Text style={typographyThemed(theme).captionSecondaryBold}>
                  Speed:
                </Text>{' '}
                Immediate
              </>
            }
            selected={isPedometerActive}
            onPress={handleSelectPedometer}
            disabled={busy}
            footer={
              <AccessExpander
                items={[
                  {
                    label: 'Physical activity',
                    status: permStatus.activityRecognition
                      ? 'granted'
                      : 'ungranted',
                  },
                  {
                    label: 'Notifications',
                    status: permStatus.postNotifications
                      ? 'granted'
                      : 'ungranted',
                  },
                  {
                    label: 'Background activity',
                    // Live FGS satisfies this item on its own; the
                    // battery-opt allowlist is only a fallback signal
                    // for when the service isn't currently running
                    // (e.g. pedometer isn't the active source).
                    status:
                      permStatus.pedometerServiceRunning ||
                      permStatus.ignoresBatteryOptimizations
                        ? 'granted'
                        : 'ungranted',
                  },
                  // On aggressive-battery OEMs (Samsung/Xiaomi/Huawei/
                  // OnePlus/Oppo/Realme/Vivo) the user also needs to
                  // whitelist us in the manufacturer's battery manager
                  // or the foreground service gets silently killed.
                  // Marked 'unverifiable' because these screens don't
                  // expose an API to check whether the app was allowed.
                  ...(oemBatteryAffected
                    ? [
                        {
                          label: oemBatteryDevPreview
                            ? '[dev] Battery settings*'
                            : 'Battery settings*',
                          status: 'unverifiable' as const,
                        } satisfies AccessItem,
                      ]
                    : []),
                ]}
                statusFootnotes={{
                  unverifiable: '*Cannot verify battery settings from app',
                }}
              />
            }
          />
          <RadioRow
            label="Health Connect"
            description={
              <>
                Sync from Health Connect which aggregates all your health data
                in one place. Data is only synced when using the app.
                {'\n'}
                <Text style={typographyThemed(theme).captionSecondaryBold}>
                  Speed:
                </Text>{' '}
                ~1-5min. Health Connect releases the data in batches on its own
                schedule.
              </>
            }
            selected={isHealthAppActive}
            onPress={handleSelectHealthApp}
            disabled={busy}
            footer={
              <>
                {/* Manual "Sync now" trigger sits above Required Access so
                    an active Health Connect user sees the refresh control
                    right under the source they just selected. */}
                {isHealthAppActive && showSyncNow && (
                  <View style={{ marginBottom: spacing.sm }}>
                    <SyncNowRow />
                  </View>
                )}
                <AccessExpander
                  items={[
                    {
                      label:
                        hcRevokePendingRestart && permStatus.hcSteps
                          ? 'Steps*'
                          : 'Steps',
                      status:
                        hcRevokePendingRestart && permStatus.hcSteps
                          ? 'pendingRestart'
                          : permStatus.hcSteps
                          ? 'granted'
                          : 'ungranted',
                    },
                    {
                      label:
                        hcRevokePendingRestart && permStatus.hcDistance
                          ? 'Distance*'
                          : 'Distance',
                      status:
                        hcRevokePendingRestart && permStatus.hcDistance
                          ? 'pendingRestart'
                          : permStatus.hcDistance
                          ? 'granted'
                          : 'ungranted',
                    },
                  ]}
                  statusFootnotes={{
                    pendingRestart: '*Restart app to reset',
                  }}
                />
                <Text
                  style={[
                    typographyThemed(theme).captionSecondary,
                    styles.chooseSourceHelp,
                  ]}
                >
                  Health Connect is built into Android 14+ or can be installed
                  from the Play Store.
                </Text>
              </>
            }
          />
        </View>
      </View>

      {(pedometerGranted || hcGranted) && (
        <View style={styles.section}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Revoke access
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            Turning a source off above stops syncing in the app but leaves the
            OS permissions you granted in place. Use the actions below to fully
            revoke access.
          </Text>

          {pedometerGranted && (
            <View style={styles.revokeSourceBlock}>
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  styles.revokeSourceLabel,
                ]}
              >
                Pedometer
              </Text>
              <Text
                style={[
                  typographyThemed(theme).captionSecondary,
                  styles.sectionText,
                ]}
              >
                Open the Android app settings and turn off the Physical activity
                permission.
              </Text>
              <View style={styles.revokeButtonRow}>
                <Button
                  variant="primary"
                  size="default"
                  onPress={handleRevokePedometer}
                  disabled={busy}
                >
                  Open app settings
                </Button>
              </View>
            </View>
          )}

          {hcGranted && (
            <View style={styles.revokeSourceBlock}>
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  styles.revokeSourceLabel,
                ]}
              >
                Health Connect
              </Text>
              <Text
                style={[
                  typographyThemed(theme).captionSecondary,
                  styles.sectionText,
                ]}
              >
                Revoke the app's access to Health Connect. Changes take effect
                after the app restarts (a limitation of the Health Connect API).
              </Text>
              {hcSessionRevoked ? (
                <>
                  <View
                    style={[
                      styles.revokedBanner,
                      {
                        backgroundColor: theme.colors.surface,
                        borderLeftColor: theme.colors.textSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typographyThemed(theme).captionPrimary,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      ↻ Access revoked. This will take effect on next load.
                    </Text>
                  </View>
                  {__DEV__ && (
                    <Text
                      style={[
                        typographyThemed(theme).captionSecondary,
                        styles.devNote,
                      ]}
                    >
                      [Dev] `npm run android` to restart the app
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.revokeButtonRow}>
                  <Button
                    variant="primary"
                    size="default"
                    onPress={handleRevokeHealthConnect}
                    disabled={busy}
                  >
                    Revoke Health Connect access
                  </Button>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text
          style={[typographyThemed(theme).captionPrimary, styles.sectionLabel]}
        >
          Manage synced data
        </Text>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.sectionText]}
        >
          Revoking access above does not automatically delete your synced data.
          You can delete synced data at any time from <SettingsRef />.
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
  revokeButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  revokeSourceBlock: {
    marginTop: spacing.md,
  },
  revokeSourceLabel: {
    marginBottom: spacing.xs,
  },
  revokedBanner: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 3,
    borderRadius: 4,
  },
  devNote: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  pickerSection: {
    marginTop: spacing.sm,
  },
  pickerRows: {
    marginTop: spacing.xs,
  },
  introText: {
    textAlign: 'left',
  },
  section: {
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
  chooseSourceLabel: {
    marginTop: spacing.md,
  },
  chooseSourceHelp: {
    marginTop: spacing.xs,
  },
  sectionText: {
    textAlign: 'left',
    marginTop: spacing.xs,
  },
});
