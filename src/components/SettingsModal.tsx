import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, shadows, iconSizes } from '../styles/global';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import Button from './Button';
import SettingsIcon from './Icons/SettingsIcon';
import HomeIcon from './Icons/HomeIcon';

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
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);

  const { internalVisible, animatedBackgroundStyle, animatedContentStyle } =
    useAnimatedModal(visible, {
      entranceDelay: 200,
      entranceDuration: 300,
      exitDuration: 150,
      translateDistance: -spacing.lg,
    });

  // Independent fade for the floating settings button (opacity-only)
  const buttonOpacity = useSharedValue(visible ? 1 : 0);
  const animatedButtonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));
  React.useEffect(() => {
    const BUTTON_ENTER_DURATION = 220;
    const BUTTON_EXIT_DURATION = 50;
    buttonOpacity.value = withTiming(visible ? 1 : 0, {
      duration: visible ? BUTTON_ENTER_DURATION : BUTTON_EXIT_DURATION,
    });
  }, [visible, buttonOpacity]);

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
          style={{
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          edges={['top', 'bottom']}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.contentWrapper, animatedContentStyle]}>
            {/* Settings Title - Outside modal */}
            <Text
              style={[
                typography.modalTitle,
                styles.title,
                { color: '#FFFFFF', ...shadows.text },
              ]}
            >
              Settings
            </Text>

            <View
              style={[
                styles.modalContainer,
                { backgroundColor: theme.colors.modalBackground },
              ]}
            >
              <TouchableOpacity
                style={styles.homeButton}
                onPress={handleHomePress}
                activeOpacity={0.7}
              >
                <HomeIcon
                  size={iconSizes.large}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    typography.modalTitle,
                    { color: theme.colors.textPrimary, fontSize: 40 },
                  ]}
                >
                  ×
                </Text>
              </TouchableOpacity>
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
                      typography.subtitle,
                      styles.sectionTitle,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Theme
                  </Text>
                  <View style={styles.themeButtons}>
                    <View style={styles.themeButtonWrapper}>
                      <Button
                        onPress={() => setTheme('minimalist')}
                        variant={
                          currentTheme === 'minimalist'
                            ? 'primary'
                            : 'secondary'
                        }
                      >
                        Minimal
                      </Button>
                    </View>
                    <View style={styles.themeButtonWrapper}>
                      <Button
                        onPress={() => setTheme('classic')}
                        variant={
                          currentTheme === 'classic' ? 'primary' : 'secondary'
                        }
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
                      typography.subtitle,
                      styles.sectionTitle,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Interface
                  </Text>

                  {/* Label Size */}
                  <View
                    style={[styles.settingRow, styles.settingRowWithBorder]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
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
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>

                  {/* Show Trivia Markers */}
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Trivia markers
                    </Text>
                    <Switch
                      value={showTriviaMarkers}
                      onValueChange={setShowTriviaMarkers}
                      trackColor={{
                        false: theme.colors.buttonInactive,
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
                      typography.subtitle,
                      styles.sectionTitle,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Map
                  </Text>

                  {/* Map Colors */}
                  <View
                    style={[styles.settingRow, styles.settingRowWithBorder]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Map colors
                    </Text>
                    <Switch
                      value={colorizeMap}
                      onValueChange={setColorizeMap}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>

                  {/* Reduced Map Titles */}
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Reduced map titles
                    </Text>
                    <Switch
                      value={reducedMapTitles}
                      onValueChange={setReducedMapTitles}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>

      {/* Settings Button - Independent fade-only animation (no translate) */}
      <Animated.View
        style={[styles.settingsButton, animatedButtonStyle]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={{
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <SettingsIcon
            size={iconSizes.medium}
            color={theme.colors.mapBackground}
          />
        </TouchableOpacity>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
  settingsButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
