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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing } from '../styles/global';
import Button from './Button';
import SettingsIcon from './SettingsIcon';

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <SafeAreaView
          style={[
            styles.overlay,
            { backgroundColor: theme.colors.modalOverlay },
          ]}
          edges={['top', 'bottom']}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: theme.colors.modalBackground },
              ]}
            >
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
              <ScrollView>
                {/* Header */}
                <View style={styles.header}>
                  <Text
                    style={[
                      typography.modalTitle,
                      styles.title,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    Settings
                  </Text>
                </View>

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
                  <View style={styles.settingRow}>
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
                  <View style={styles.settingRow}>
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
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </SafeAreaView>
      </TouchableWithoutFeedback>

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
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
  },
  title: {},
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
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
