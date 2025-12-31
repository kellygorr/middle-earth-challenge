import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { typography, typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import Button from '../Buttons';
import { useProgressStore } from '../../stores/progressStore';
import JourneyProgressBar from '../JourneyProgressBar';

interface WelcomeModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function WelcomeModal({
  visible,
  onDismiss,
}: WelcomeModalProps) {
  const theme = useTheme();
  const miles = useProgressStore(state => state.miles) || 0;

  const { internalVisible, animatedBackgroundStyle, animatedContentStyle } =
    useAnimatedModal(visible, {
      translateDistance: 0, // fade-only for welcome
      entranceDelay: motion.modal.entranceDelay,
      entranceDuration: motion.modal.entranceDuration,
      exitDuration: motion.modal.exitDuration,
      easing: motion.easing.standard,
    });

  return (
    <Modal
      visible={internalVisible}
      transparent={true}
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
                {miles > 0 ? 'Continue journey' : 'Begin journey'}
              </Button>
            </View>
          </Animated.View>
          {miles > 0 && (
            <Animated.View
              style={[styles.bottomProgressContainer, animatedContentStyle]}
            >
              <JourneyProgressBar isLocked={false} darkMode />
            </Animated.View>
          )}
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
  bottomProgressContainer: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
  },
});
