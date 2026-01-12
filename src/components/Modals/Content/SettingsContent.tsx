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
import { SyncIcon, DevModeIcon, DataIcon } from '../../../assets/icons';
import { useUIStore } from '../../../stores/uiStore';
import { fitnessService } from '../../../services/fitnessService';

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
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );
  const pushModal = useUIStore(state => state.pushModal);

  const handleDisconnectSync = async () => {
    // Revoke permissions from Health Connect
    await fitnessService.disconnect();
    // Update settings
    setSyncEnabled(false);
    // Clear last sync so reconnect starts fresh
    useSettingsStore.getState().setLastSyncTimestamp(null);
  };

  return (
    <>
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

        {/* Large Labels */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Large labels
          </Text>
          <Switch
            value={labelSize === 'large'}
            onValueChange={value => setLabelSize(value ? 'large' : 'regular')}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
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

        {/* Reduced Map Titles */}
        <View
          style={[
            styles.contentRow,
            styles.contentRowSpaceBetween,
            styles.contentRowBorderBottom,
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
            Reduced map titles
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
        <SectionHeader title="Health data" />

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
                  {`Syncing from ${
                    syncProvider === 'health-connect'
                      ? 'Health Connect'
                      : syncProvider === 'apple-health'
                      ? 'Apple Health'
                      : 'health app'
                  }`}
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
                Sync with health app
              </Text>
            )}
          </Pressable>
          <Switch
            value={syncEnabled}
            onValueChange={value => {
              if (value) {
                pushModal({ type: 'sync' });
              } else {
                handleDisconnectSync();
              }
            }}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </View>

        {/* Live sync toggle - always visible under sync option */}
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
              See your progress update in real-time
            </Text>
          </View>
          <Switch
            value={liveSyncEnabled}
            onValueChange={setLiveSyncEnabled}
            disabled={!syncEnabled}
            trackColor={{
              false: theme.colors.switchInactive,
              true: theme.colors.buttonPrimary,
            }}
            thumbColor={theme.colors.surface}
          />
        </View>
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
        <View style={{ paddingBottom: spacing.md }}>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              { fontWeight: '600' },
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
            to track your journey progress. No data is sent to external servers.
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
});
