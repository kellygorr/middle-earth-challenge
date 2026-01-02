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
import { useUIStore } from '../../stores/uiStore';
import { typography, typographyThemed } from '../../styles/typography';
import { spacing, borderRadius } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import Button from '../Buttons';
import { SyncButton } from '../ButtonIcons';
import { useProgressStore } from '../../stores/progressStore';
import JourneyProgressBar from '../JourneyProgressBar';
import SyncIndicator from '../SyncIndicator';

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
  const syncError = useProgressStore(state => state.syncError);
  const setSyncError = useProgressStore(state => state.setSyncError);
  const setShowSyncModal = useUIStore(state => state.setShowSyncModal);

  const handleReconnect = () => {
    // Clear the error and open sync modal
    setSyncError(null);
    setShowSyncModal(true);
  };

  const handleDismiss = () => {
    // Clear sync error when user dismisses welcome modal
    if (syncError) {
      setSyncError(null);
    }
    onDismiss();
  };

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
      onRequestClose={handleDismiss}
      statusBarTranslucent={true}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.modalOverlay },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={handleDismiss}>
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
              <Button onPress={handleDismiss} variant="brand" size="large">
                {miles > 0 ? 'Continue journey' : 'Begin journey'}
              </Button>

              {/* Sync error message */}
              {syncError && (
                <View style={styles.syncErrorContainer}>
                  <Text
                    style={[
                      styles.syncErrorText,
                      { color: theme.colors.textInverted },
                    ]}
                  >
                    {syncError}
                  </Text>
                  <SyncButton
                    size={40}
                    variant="brand"
                    onPress={handleReconnect}
                  />
                </View>
              )}
            </View>
          </Animated.View>
          {miles > 0 && (
            <View style={styles.bottomProgressContainer}>
              <SyncIndicator style={styles.syncIndicator} />
              <JourneyProgressBar isLocked={false} darkMode />
            </View>
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
    alignItems: 'center',
  },
  syncIndicator: {
    marginBottom: spacing.lg,
  },
  syncErrorContainer: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: borderRadius.md,
  },
  syncErrorText: {
    ...typography.body,
    textAlign: 'center',
    opacity: 0.9,
  },
});
