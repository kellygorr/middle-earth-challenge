import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes, shadows } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import Button from '../Buttons';
import { HomeButton, CloseButton } from '../ButtonIcons';

interface SettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function SettingsModal({
  visible,
  onDismiss,
}: SettingsModalProps) {
  const theme = useTheme();
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

  const {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    contentOpacitySV,
  } = useAnimatedModal(visible, {
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
    translateDistance: -spacing.lg,
  });

  // Sync card shadow/background with content fade to avoid shadow-only frames
  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  const handleHomePress = () => {
    setShowWelcome(true);
    onDismiss();
  };

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.modalOverlay },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <SafeAreaView
          style={styles.safeArea}
          edges={['top', 'bottom']}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.contentWrapper, animatedContentStyle]}>
            {/* Settings Title - Outside modal */}
            <Text
              style={[
                typographyThemed(theme).titleMediumInverted,
                styles.title,
              ]}
            >
              Settings
            </Text>

            <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
              <HomeButton
                style={styles.homeButton}
                size={iconSizes.large}
                onPress={handleHomePress}
              />
              <CloseButton
                style={styles.closeButton}
                size={iconSizes.medium}
                onPress={onDismiss}
              />
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
              >
                {/* Theme Selection */}
                <View style={styles.section}>
                  <Text
                    style={[
                      typographyThemed(theme).subtitleLargePrimary,
                      styles.sectionTitle,
                    ]}
                  >
                    Theme
                  </Text>
                  <View style={styles.themeButtons}>
                    <View style={styles.themeButtonWrapper}>
                      <Button
                        onPress={() => setTheme('minimalist')}
                        variant={
                          currentTheme === 'minimalist' ? 'brand' : 'outline'
                        }
                        size={'large'}
                      >
                        Minimal
                      </Button>
                    </View>
                    <View style={styles.themeButtonWrapper}>
                      <Button
                        onPress={() => setTheme('classic')}
                        variant={
                          currentTheme === 'classic' ? 'brand' : 'outline'
                        }
                        size={'large'}
                      >
                        Classic
                      </Button>
                    </View>
                  </View>
                </View>

                {/* Interface Options */}
                <View style={styles.section}>
                  <Text
                    style={[
                      typographyThemed(theme).subtitleLargePrimary,
                      styles.sectionTitle,
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
                    <Text
                      style={[
                        typographyThemed(theme).bodyPrimary,
                        styles.flex1,
                      ]}
                    >
                      Large labels
                    </Text>
                    <Switch
                      value={labelSize === 'large'}
                      onValueChange={value =>
                        setLabelSize(value ? 'large' : 'regular')
                      }
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
                    <Text
                      style={[
                        typographyThemed(theme).bodyPrimary,
                        styles.flex1,
                      ]}
                    >
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
                    <Text
                      style={[
                        typographyThemed(theme).bodyPrimary,
                        styles.flex1,
                      ]}
                    >
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
                <View style={styles.section}>
                  <Text
                    style={[
                      typographyThemed(theme).subtitleLargePrimary,
                      styles.sectionTitle,
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
                    <Text
                      style={[
                        typographyThemed(theme).bodyPrimary,
                        styles.flex1,
                      ]}
                    >
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
                    <Text
                      style={[
                        typographyThemed(theme).bodyPrimary,
                        styles.flex1,
                      ]}
                    >
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
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 500,
    flex: 1,
    maxHeight: '80%',
    alignItems: 'flex-start',
  },
  title: {
    marginBottom: spacing.sm,
  },
  modalContainer: {
    width: '100%',
    flex: 1,
    minHeight: 400,
    borderRadius: 16,
    ...shadows.large,
    paddingTop: 64, // Space for larger home/close buttons
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  homeButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
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
