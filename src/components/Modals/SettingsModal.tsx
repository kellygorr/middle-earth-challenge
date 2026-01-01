import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import {
  spacing,
  iconSizes,
  iconButtonSizes,
  borderRadius,
} from '../../styles/global';
import { modalStyles } from '../../styles/modalStyles';
import ModalWrapper from './ModalWrapper';
import SyncOptionsModal from './SyncOptionsModal';
import Button from '../Buttons';
import { HomeButton, SyncButton, DevModeButton } from '../ButtonIcons';
import { useProgressStore } from '../../stores/progressStore';
import { fitnessService } from '../../services/fitnessService';

interface SettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function SettingsModal({
  visible,
  onDismiss,
}: SettingsModalProps) {
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
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);
  // Sync settings
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const lastSyncTimestamp = useSettingsStore(state => state.lastSyncTimestamp);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const setLiveSyncEnabled = useSettingsStore(
    state => state.setLiveSyncEnabled,
  );
  const distanceEntries = useProgressStore(state => state.distanceEntries);
  const hasSyncedData = distanceEntries.some(e => e.source === 'synced');

  // State for sync options modal
  const [showSyncOptions, setShowSyncOptions] = React.useState(false);

  const handleHomePress = () => {
    setShowWelcome(true);
    onDismiss();
  };

  const handleDisconnectSync = async () => {
    // Revoke permissions from Health Connect
    await fitnessService.disconnect();
    // Update settings
    setSyncEnabled(false);
  };

  return (
    <ModalWrapper
      visible={visible}
      onDismiss={onDismiss}
      title="Settings"
      leftButton={
        <HomeButton size={iconSizes.large} onPress={handleHomePress} />
      }
    >
      <ScrollView
        style={modalStyles.scrollView}
        contentContainerStyle={modalStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme Selection */}
        <View style={modalStyles.section}>
          <Text
            style={[
              typographyThemed(theme).subtitleLargePrimary,
              modalStyles.sectionTitle,
            ]}
          >
            Theme
          </Text>
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
        </View>

        {/* Map Options */}
        <View style={modalStyles.section}>
          <Text
            style={[
              typographyThemed(theme).subtitleLargePrimary,
              modalStyles.sectionTitle,
            ]}
          >
            Map
          </Text>

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
          <View style={[styles.contentRow, styles.contentRowSpaceBetween]}>
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
        </View>

        {/* Health Data Sync */}
        <View style={modalStyles.section}>
          <Text
            style={[
              typographyThemed(theme).subtitleLargePrimary,
              modalStyles.sectionTitle,
            ]}
          >
            Health Data
          </Text>

          {/* Sync option - show toggle with icon */}
          <Pressable
            style={[
              styles.contentRow,
              styles.contentRowSpaceBetween,
              styles.contentRowWithGap,
            ]}
            onPress={() => {
              if (syncEnabled) {
                handleDisconnectSync();
              } else {
                setShowSyncOptions(true);
              }
            }}
          >
            <View style={styles.iconButtonContainer}>
              <SyncButton
                size={iconSizes.medium}
                variant={syncEnabled ? 'brand' : 'primary'}
              />
            </View>
            <View style={styles.flex1}>
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
                      ).toLocaleDateString()}`}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={[typographyThemed(theme).bodyPrimary]}>
                  Sync from health app
                </Text>
              )}
            </View>
            <Switch
              value={syncEnabled}
              onValueChange={value => {
                if (value) {
                  setShowSyncOptions(true);
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
          </Pressable>

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
                {`Live sync (${liveSyncEnabled ? 'enabled' : 'disabled'})`}
              </Text>
              <Text style={[typographyThemed(theme).captionSecondary]}>
                Enable this when exercising with the app open to see your
                progress update in real-time
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

          {/* Delete synced data button - always visible, disabled if no synced data */}
          <View
            style={[
              styles.contentRow,
              styles.contentRowSpaceBetween,
              styles.contentRowBorderTop,
              { borderTopColor: theme.colors.divider },
            ]}
          >
            <Text style={[typographyThemed(theme).bodySecondary, styles.flex1]}>
              {hasSyncedData
                ? 'Delete synced data'
                : 'No synced data to delete'}
            </Text>
            <Button
              onPress={() => {
                // TODO: Delete all synced entries from database
                // TODO: Show confirmation dialog
              }}
              variant="outline"
              size={'default'}
              disabled={!hasSyncedData}
            >
              Delete
            </Button>
          </View>
        </View>

        {/* Developer Settings */}
        <View style={modalStyles.section}>
          <Text
            style={[
              typographyThemed(theme).subtitleLargePrimary,
              modalStyles.sectionTitle,
            ]}
          >
            Developer Settings
          </Text>

          <Pressable
            style={[
              styles.contentRow,
              styles.contentRowSpaceBetween,
              styles.contentRowWithGap,
            ]}
            onPress={() => setDevMode(!devMode)}
          >
            <View style={styles.iconButtonContainer}>
              <DevModeButton
                size={iconSizes.medium}
                variant={devMode ? 'brand' : 'primary'}
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
        </View>

        {/* Footer info */}
        <View style={{ paddingTop: spacing.lg }}>
          {Platform.OS === 'android' && (
            <>
              <Text
                style={[
                  typographyThemed(theme).captionPrimary,
                  { fontWeight: '600' },
                ]}
              >
                Revoking access (android)
              </Text>
              <Text
                style={[
                  typographyThemed(theme).captionSecondary,
                  { marginBottom: spacing.sm },
                ]}
              >
                When revoking sync access, permissions are removed after app
                restart. This is a limitation of the Health Connect API.
              </Text>
            </>
          )}
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
      </ScrollView>

      {/* Sync options modal */}
      <SyncOptionsModal
        visible={showSyncOptions}
        onDismiss={() => setShowSyncOptions(false)}
      />
    </ModalWrapper>
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
