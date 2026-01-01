import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes } from '../../styles/global';
import { modalStyles } from '../../styles/modalStyles';
import ModalWrapper from './ModalWrapper';
import Button from '../Buttons';
import { HomeButton } from '../ButtonIcons';

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
  const showTriviaMarkers = useSettingsStore(state => state.showTriviaMarkers);
  const setShowTriviaMarkers = useSettingsStore(
    state => state.setShowTriviaMarkers,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const setColorizeMap = useSettingsStore(state => state.setColorizeMap);
  const reducedMapTitles = useSettingsStore(state => state.reducedMapTitles);
  const setReducedMapTitles = useSettingsStore(
    state => state.setReducedMapTitles,
  );
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);

  const handleHomePress = () => {
    setShowWelcome(true);
    onDismiss();
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

        {/* Interface Options */}
        <View style={modalStyles.section}>
          <Text
            style={[
              typographyThemed(theme).subtitleLargePrimary,
              modalStyles.sectionTitle,
            ]}
          >
            Interface
          </Text>

          {/* Label Size */}
          <View
            style={[
              styles.settingRow,
              styles.settingRowWithBorder,
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

          {/* Show Trivia Markers */}
          <View
            style={[
              styles.settingRow,
              styles.settingRowWithBorder,
              { borderBottomColor: theme.colors.divider },
            ]}
          >
            <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
              Trivia markers
            </Text>
            <Switch
              value={showTriviaMarkers}
              onValueChange={setShowTriviaMarkers}
              trackColor={{
                false: theme.colors.switchInactive,
                true: theme.colors.buttonPrimary,
              }}
              thumbColor={theme.colors.surface}
            />
          </View>

          {/* Developer Mode */}
          <View style={styles.settingRow}>
            <Text style={[typographyThemed(theme).bodyPrimary, styles.flex1]}>
              Developer mode
            </Text>
            <Switch
              value={devMode}
              onValueChange={setDevMode}
              trackColor={{
                false: theme.colors.switchInactive,
                true: theme.colors.buttonPrimary,
              }}
              thumbColor={theme.colors.surface}
            />
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

          {/* Map Colors */}
          <View
            style={[
              styles.settingRow,
              styles.settingRowWithBorder,
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
          <View style={styles.settingRow}>
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
      </ScrollView>
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  settingRowWithBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
});
