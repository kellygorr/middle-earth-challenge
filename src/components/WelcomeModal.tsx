import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { typography, typographyThemed } from '../styles/typography';
import { spacing } from '../styles/global';
import Button from './Buttons';

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
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.modalOverlay },
          ]}
        >
          <TouchableWithoutFeedback>
            <View style={styles.welcomeContainer}>
              <Text
                style={[
                  styles.title,
                  typographyThemed(theme).titleLargeInverted,
                ]}
              >
                Middle Earth
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  typographyThemed(theme).subtitleLargeInverted,
                ]}
              >
                1,235 miles from Bag End to Mount Doom
              </Text>
              <Button onPress={onDismiss} variant="brand" size="large">
                Begin Journey
              </Button>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.titleLarge,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.subtitleLarge,
    marginBottom: spacing.xxl,
  },
});
