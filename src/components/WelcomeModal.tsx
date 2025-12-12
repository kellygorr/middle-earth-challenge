import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../stores/settingsStore';
import { typography } from '../styles/typography';
import { spacing, shadows } from '../styles/global';
import Button from './Button';

interface WelcomeModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function WelcomeModal({
  visible,
  onDismiss,
}: WelcomeModalProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent={true}
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
            <View style={styles.welcomeContainer}>
              <Text
                style={[
                  styles.title,
                  { color: theme.colors.textOnPrimary, ...shadows.text },
                ]}
              >
                Middle Earth
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.textOnPrimary, ...shadows.text },
                ]}
              >
                1,235 miles from Bag End to Mount Doom
              </Text>
              <Button onPress={onDismiss} variant="primary">
                Begin Journey
              </Button>
            </View>
          </TouchableWithoutFeedback>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.subtitle,
    marginBottom: spacing.xxl,
  },
});
