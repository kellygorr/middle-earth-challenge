import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
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
import SyncErrorBanner from '../../SyncErrorBanner';
import { SyncNowRow } from '../../SyncNowRow';
import { SyncIcon, DevModeIcon, DataIcon } from '../../../assets/icons';
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
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );
  const pushModal = useUIStore(state => state.pushModal);
  const miles = useProgressStore(state => state.miles) || 0;
  // Mirror SyncNowRow's full internal guard (syncEnabled + syncProvider !==
  // 'none' + miles > 0) so the wrapper's top border doesn't render as an
  // empty bordered row above the Live sync section — which used to show
  // as a double line in pedometer mode (syncProvider === 'none' there).
  const showSyncNow = syncEnabled && syncProvider !== 'none' && miles > 0;
  // Live sync is only meaningful when we have a health-app provider whose
  // fetch cadence we can throttle. Pedometer is inherently live (steps
  // stream from the sensor as they happen), so the toggle would be a
  // dead-end there — hide it entirely.
  const showLiveSync = syncEnabled && trackingMode !== 'pedometer';

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
        <View
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
        </View>

        {/* Subtle map labels */}
        <View
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
        </View>

        {/* Distance Units */}
        <View style={[styles.contentRow, styles.contentRowSpaceBetween]}>
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
        </View>
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
            {syncEnabled ? (
              <>
                <Text style={[typographyThemed(theme).bodyPrimary]}>
                  Health sync enabled. Tap to manage sync options
                </Text>
                {lastSyncTimestamp && (
                  <Text style={[typographyThemed(theme).captionSecondary]}>
                    {`Last synced: ${new Date(
                      lastSyncTimestamp,
                    ).toLocaleString()}`}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[typographyThemed(theme).bodyPrimary]}>
                {Platform.OS === 'android'
                  ? 'Sync with health app or pedometer'
                  : 'Sync with health app'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Manual sync trigger. Hidden entirely when not connected or before
            the first sync lands miles — otherwise it looks like the user
            needs to tap it to sync, but tapping wouldn't do anything yet. */}
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
          <View
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
          </View>
        )}
      </Section>

      {/* Developer Settings */}
      <Section>
        <SectionHeader title="Developer settings" />

        <Pressable
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowWithGap,
          ]}
          onPress={() => setDevMode(!devMode)}
        >
          <View style={styles.iconButtonContainer}>
            <IconButton
              icon={<DevModeIcon size={iconSizes.medium} />}
              variant={devMode ? 'brand' : 'outline'}
            />
          </View>
          <View style={styles.flex1}>
            <Text style={[typographyThemed(theme).captionSecondary]}>
              {devMode
                ? 'Dev mode is enabled. Tap to disable'
                : 'Not ready to commit? Take a look at the map in dev mode'}
            </Text>
          </View>
          <Switch
            value={devMode}
            onValueChange={setDevMode}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </Pressable>
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
            to calculate your journey progress. No data is sent to external
            servers.
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
