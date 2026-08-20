import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import {
  spacing,
  iconSizes,
  iconButtonSizes,
  borderRadius,
} from '../../../styles/global';
import Button, { IconButton } from '../../Buttons';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import ToggleRow from '../ToggleRow';
import SyncErrorBanner from '../../SyncErrorBanner';
import { SyncNowRow } from '../../SyncNowRow';
import { SyncIcon, DataIcon, ChatIcon } from '../../../assets/icons';
import { useUIStore } from '../../../stores/uiStore';

/**
 * SettingsContent - Content component for the Settings modal.
 * Extracted from SettingsModal for use with SharedModal.
 */
export default function SettingsContent() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const currentTheme = useSettingsStore(state => state.currentTheme);
  const setTheme = useSettingsStore(state => state.setTheme);
  const labelSize = useSettingsStore(state => state.labelSize);
  const setLabelSize = useSettingsStore(state => state.setLabelSize);
  const textSize = useSettingsStore(state => state.textSize);
  const setTextSize = useSettingsStore(state => state.setTextSize);
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const setColorizeMap = useSettingsStore(state => state.setColorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);
  const setReducedMapTitles = useSettingsStore(
    state => state.setReducedMapTitles,
  );
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);
  const setUseMiles = useSettingsStore(state => state.setUseMiles);
  // Sync settings
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const lastSyncDate = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;
  const today = new Date();
  const lastSyncWasToday =
    lastSyncDate !== null &&
    lastSyncDate.getFullYear() === today.getFullYear() &&
    lastSyncDate.getMonth() === today.getMonth() &&
    lastSyncDate.getDate() === today.getDate();
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const sharingProvisioningPending = useSettingsStore(
    state => state.sharingProvisioningPending,
  );
  const sharingDeletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const pushModal = useUIStore(state => state.pushModal);
  // Mirror SyncNowRow's internal guard so the wrapper's top border does not
  // render as an empty row when no health provider is connected.
  const showSyncNow =
    syncEnabled && syncProvider !== 'none' && trackingMode === 'health-app';
  // Live sync is only meaningful when we have a health-app provider whose
  // fetch cadence we can throttle. Pedometer is inherently live (steps
  // stream from the sensor as they happen), so the toggle would be a
  // dead-end there — hide it entirely.
  const showLiveSync = syncEnabled && trackingMode === 'health-app';

  return (
    <>
      {/* Sync error advisory (renders nothing when no error) */}
      <SyncErrorBanner />

      {/* Theme Selection */}
      <SectionHeader title="Theme" />
      <View style={styles.themeButtons}>
        <View style={styles.themeButtonWrapper}>
          <Button
            onPress={() => setTheme('minimalist')}
            variant={currentTheme === 'minimalist' ? 'brand' : 'outline'}
            size={isLandscape ? 'default' : 'large'}
          >
            Minimal
          </Button>
        </View>
        <View style={styles.themeButtonWrapper}>
          <Button
            onPress={() => setTheme('classic')}
            variant={currentTheme === 'classic' ? 'brand' : 'outline'}
            size={isLandscape ? 'default' : 'large'}
          >
            Classic
          </Button>
        </View>
      </View>

      {/* Map Options */}
      <Section>
        <SectionHeader title="Map" />

        {/* Map label size */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Map label size
          </Text>
          <View style={styles.labelSizeGroup}>
            {(['small', 'medium', 'large'] as const).map(size => (
              <Button
                key={size}
                onPress={() => setLabelSize(size)}
                variant={labelSize === size ? 'brand' : 'outline'}
                size="xs"
              >
                {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
              </Button>
            ))}
          </View>
        </View>

        {/* Text size */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Text size
          </Text>
          <View style={styles.labelSizeGroup}>
            {(['small', 'medium', 'large'] as const).map(size => (
              <Button
                key={size}
                onPress={() => setTextSize(size)}
                variant={textSize === size ? 'brand' : 'outline'}
                size="xs"
              >
                {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
              </Button>
            ))}
          </View>
        </View>

        {/* Map Colors */}
        <Pressable
          onPress={() => setColorizeMap(!colorizeMap)}
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Map colors
          </Text>
          <Switch
            value={colorizeMap}
            onValueChange={setColorizeMap}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </Pressable>

        {/* Subtle map labels */}
        <Pressable
          onPress={() => setReducedMapTitles(!reducedMapTitles)}
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Subtle map labels
          </Text>
          <Switch
            value={reducedMapTitles}
            onValueChange={setReducedMapTitles}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </Pressable>

        {/* Distance Units */}
        <Pressable
          onPress={() => setUseMiles(!useMiles)}
          style={[styles.contentRow, styles.contentRowSpaceBetween]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Kilometers/Miles
          </Text>
          <Switch
            value={useMiles}
            onValueChange={setUseMiles}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </Pressable>
      </Section>

      {/* Health Data Sync */}
      <Section>
        <SectionHeader title="Sync health data" />

        {/* Sync option - show toggle with icon */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowWithGap,
          ]}
        >
          <Pressable
            style={styles.iconButtonContainer}
            onPress={() => pushModal({ type: 'sync' })}
          >
            <IconButton
              icon={<SyncIcon size={iconSizes.medium} />}
              variant={syncEnabled ? 'brand' : 'outline'}
            />
          </Pressable>
          <Pressable
            style={styles.flex1}
            onPress={() => pushModal({ type: 'sync' })}
          >
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Manage health syncing
            </Text>
            {syncEnabled && lastSyncDate ? (
              <Text style={[typographyThemed(theme).captionSecondary]}>
                {`Last synced: ${
                  lastSyncWasToday
                    ? `Today, ${lastSyncDate.toLocaleTimeString(undefined, {
                        timeStyle: 'short',
                      })}`
                    : lastSyncDate.toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                }`}
              </Text>
            ) : (
              <Text style={[typographyThemed(theme).captionSecondary]}>
                {syncEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Manual sync trigger. Hidden when no health provider is connected. */}
        {showSyncNow && (
          <View
            style={[
              styles.contentRow,
              styles.contentRowBorderTop,
              { borderTopColor: theme.colors.divider },
            ]}
          >
            <SyncNowRow />
          </View>
        )}

        {/* Live sync toggle - only visible when connected to a health app
            (not pedometer — that's inherently live). Without a source
            there's nothing to "live sync" from, so hiding keeps the UI
            honest and avoids a disabled-toggle dead-end. */}
        {showLiveSync && (
          <Pressable
            onPress={() => setLiveSyncEnabled(!liveSyncEnabled)}
            style={[
              styles.contentRow,
              styles.contentRowSpaceBetween,
              styles.contentRowBorderTop,
              { borderTopColor: theme.colors.divider },
            ]}
          >
            <View style={styles.flex1}>
              <Text style={[typographyThemed(theme).bodyPrimary]}>
                {`Live sync`}
              </Text>
              <Text style={[typographyThemed(theme).captionSecondary]}>
                See your progress update in real-time in this app
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
          </Pressable>
        )}
      </Section>

      <Section>
        <SectionHeader title="Connect with other Hobbits" />
        <Text
          style={[
            typographyThemed(theme).bodyPrimary,
            styles.sectionDescription,
          ]}
        >
          Share your journey progress with friends and see their progress on
          your map.
        </Text>
        <ToggleRow
          label="Connect with friends"
          caption={
            sharingDeletionPending
              ? 'Sharing off - deletion pending'
              : sharingProvisioningPending
              ? 'Finishing sharing setup'
              : sharingEnabled
              ? 'Sharing on'
              : 'Sharing off'
          }
          onPress={() => pushModal({ type: 'friend-progress' })}
          icon={
            <IconButton
              icon={<ChatIcon size={iconSizes.medium} />}
              variant={
                sharingEnabled || sharingProvisioningPending
                  ? 'brand'
                  : 'outline'
              }
            />
          }
        />
      </Section>

      {/* Developer Settings */}
      <Section>
        <SectionHeader title="Developer settings" />

        <ToggleRow
          label="Dev mode"
          caption="Not ready to commit? Take a look at the map in dev mode."
          value={devMode}
          onValueChange={setDevMode}
        />
      </Section>

      {/* Data Management */}
      <Section>
        <SectionHeader title="Data" />

        {/* Data use info */}
        <View style={styles.dataUseIntro}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.dataUseHeading,
            ]}
          >
            Data use
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              { marginTop: spacing.xs },
            ]}
          >
            Your distance data is stored locally on your device and is only used
            to calculate your journey progress. Health records and activity
            details remain on this device.
          </Text>
        </View>

        <Pressable
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowWithGap,
            styles.contentRowBorderTop,
            { borderTopColor: theme.colors.divider },
          ]}
          onPress={() => pushModal({ type: 'data' })}
        >
          <View style={styles.iconButtonContainer}>
            <IconButton
              icon={<DataIcon size={iconSizes.medium} />}
              variant="primary"
            />
          </View>
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).bodyPrimary]}>
              Manage data
            </Text>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              Delete synced data, reset progress, or clear settings
            </Text>
          </View>
        </Pressable>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  themeButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionDescription: {
    marginBottom: spacing.sm,
  },
  themeButtonWrapper: {
    flex: 1,
  },
  labelSizeGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  // Base row style - all content rows use this
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  // Modifier: pushes content to edges (label on left, control on right)
  contentRowSpaceBetween: {
    justifyContent: 'space-between',
  },
  // Modifier: adds gap between items (icon + text)
  contentRowWithGap: {
    gap: spacing.md,
  },
  // Modifier: border on bottom
  contentRowBorderBottom: {
    borderBottomWidth: 1,
  },
  // Modifier: border on top
  contentRowBorderTop: {
    borderTopWidth: 1,
  },
  // Icon button container (sync, dev mode)
  iconButtonContainer: {
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
  },
  dataUseIntro: {
    paddingBottom: spacing.md,
  },
  dataUseHeading: {
    fontWeight: '600',
  },
});
