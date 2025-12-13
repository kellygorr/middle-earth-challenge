import React, { useEffect } from 'react';
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
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, shadows } from '../styles/global';
import Button from './Button';
import SettingsIcon from './SettingsIcon';
import HomeIcon from './HomeIcon';

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
  const showMapTitles = useSettingsStore(state => state.showMapTitles);
  const setShowMapTitles = useSettingsStore(state => state.setShowMapTitles);
  const setShowWelcome = useSettingsStore(state => state.setShowWelcome);

  const handleHomePress = () => {
    setShowWelcome(true);
    onDismiss();
  };

  // Animation values
  const backgroundOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(-spacing.lg);

  // Trigger animations when visible changes
  useEffect(() => {
    if (visible) {
      // Entrance: background fades in, then content slides down
      backgroundOpacity.value = withTiming(1, { duration: 200 });
      contentOpacity.value = withDelay(
        200,
        withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        }),
      );
      contentTranslateY.value = withDelay(
        200,
        withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        }),
      );
    } else {
      // Exit: content slides up, then background fades out
      contentOpacity.value = withTiming(0, { duration: 200 });
      contentTranslateY.value = withTiming(-spacing.lg, { duration: 200 });
      backgroundOpacity.value = withDelay(
        200,
        withTiming(0, { duration: 150 }),
      );
    }
  }, [visible, backgroundOpacity, contentOpacity, contentTranslateY]);

  // Animated styles
  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  return (
    <Modal
      visible={visible}
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
        {/* Background overlay - dismisses modal when tapped */}
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
                <HomeIcon size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    typography.modalTitle,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  ×
                </Text>
              </TouchableOpacity>
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
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

                  {/* Map Titles */}
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Map titles
                    </Text>
                    <Switch
                      value={showMapTitles}
                      onValueChange={setShowMapTitles}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>
                </View>

                {/* Test Section 1 */}
                <View style={styles.section}>
                  <Text
                    style={[
                      typography.subtitle,
                      styles.sectionTitle,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Test Section 1
                  </Text>
                  <View
                    style={[styles.settingRow, styles.settingRowWithBorder]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Test option 1
                    </Text>
                    <Switch
                      value={false}
                      onValueChange={() => {}}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Test option 2
                    </Text>
                    <Switch
                      value={false}
                      onValueChange={() => {}}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>
                </View>

                {/* Test Section 2 */}
                <View style={styles.section}>
                  <Text
                    style={[
                      typography.subtitle,
                      styles.sectionTitle,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Test Section 2
                  </Text>
                  <View
                    style={[styles.settingRow, styles.settingRowWithBorder]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Test option 3
                    </Text>
                    <Switch
                      value={false}
                      onValueChange={() => {}}
                      trackColor={{
                        false: theme.colors.buttonInactive,
                        true: theme.colors.buttonPrimary,
                      }}
                      thumbColor={theme.colors.surface}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        typography.body,
                        { color: theme.colors.textPrimary, flex: 1 },
                      ]}
                    >
                      Test option 4
                    </Text>
                    <Switch
                      value={false}
                      onValueChange={() => {}}
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

      {/* Settings Button - Rendered inside modal to be above overlay */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={onDismiss}
        activeOpacity={0.7}
      >
        <SettingsIcon size={24} color="#FFFFFF" />
      </TouchableOpacity>
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
    maxHeight: '85%',
    alignItems: 'flex-start',
  },
  title: {
    marginBottom: spacing.md,
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: 56, // Space for home/close buttons
  },
  homeButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 56,
    height: 56,
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
