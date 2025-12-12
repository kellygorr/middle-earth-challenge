import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing } from '../styles/global';
import Button from './Button';

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
  const showCheckpointLabels = useSettingsStore(
    state => state.showCheckpointLabels,
  );
  const setShowCheckpointLabels = useSettingsStore(
    state => state.setShowCheckpointLabels,
  );
  const showTriviaMarkers = useSettingsStore(state => state.showTriviaMarkers);
  const setShowTriviaMarkers = useSettingsStore(
    state => state.setShowTriviaMarkers,
  );
  const colorizeMap = useSettingsStore(state => state.colorizeMap);
  const setColorizeMap = useSettingsStore(state => state.setColorizeMap);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <SafeAreaView
        style={[styles.overlay, { backgroundColor: theme.colors.modalOverlay }]}
        edges={['top', 'bottom']}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.colors.modalBackground },
          ]}
        >
          <ScrollView>
            {/* Header */}
            <View style={styles.header}>
              <Text
                style={[
                  typography.title,
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
                      currentTheme === 'minimalist' ? 'primary' : 'secondary'
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

            {/* Map Display Options */}
            <View style={styles.section}>
              <Text
                style={[
                  typography.subtitle,
                  styles.sectionTitle,
                  { color: theme.colors.textPrimary },
                ]}
              >
                Map Display
              </Text>

              {/* Show Checkpoint Labels */}
              <View style={styles.settingRow}>
                <Text
                  style={[
                    typography.body,
                    { color: theme.colors.textPrimary, flex: 1 },
                  ]}
                >
                  Labels
                </Text>
                <Switch
                  value={showCheckpointLabels}
                  onValueChange={setShowCheckpointLabels}
                  trackColor={{
                    false: theme.colors.secondary,
                    true: theme.colors.accent,
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
                  Trivia Markers
                </Text>
                <Switch
                  value={showTriviaMarkers}
                  onValueChange={setShowTriviaMarkers}
                  trackColor={{
                    false: theme.colors.secondary,
                    true: theme.colors.accent,
                  }}
                  thumbColor={theme.colors.surface}
                />
              </View>

              {/* Map Colors */}
              <View style={styles.settingRow}>
                <Text
                  style={[
                    typography.body,
                    { color: theme.colors.textPrimary, flex: 1 },
                  ]}
                >
                  Map Colors
                </Text>
                <Switch
                  value={colorizeMap}
                  onValueChange={setColorizeMap}
                  trackColor={{
                    false: theme.colors.secondary,
                    true: theme.colors.accent,
                  }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            </View>
          </ScrollView>

          {/* Close Button */}
          <Button onPress={onDismiss} variant="primary">
            Close
          </Button>
        </View>
      </SafeAreaView>
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
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 20,
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
});
