import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { useTheme } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { typography, typographyThemed } from '../styles/typography';
import { spacing, borderRadius, iconSizes } from '../styles/global';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import { motion } from '../styles/motion';
import Button, { IconButton } from '../components/Buttons';
import { SyncIcon } from '../assets/icons';
import { useProgressStore } from '../stores/progressStore';
import JourneyProgressBar from '../components/JourneyProgressBar';
import SyncIndicator from '../components/SyncIndicator';

interface WelcomeModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function WelcomeModal({
  visible,
  onDismiss,
}: WelcomeModalProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const miles = useProgressStore(state => state.miles) || 0;
  const syncError = useProgressStore(state => state.syncError);
  const setSyncError = useProgressStore(state => state.setSyncError);
  const pushModal = useUIStore(state => state.pushModal);

  const {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    dismiss,
  } = useAnimatedModal(visible, {
    translateDistance: 0, // fade-only for welcome
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
  });

  const handleReconnect = () => {
    // Clear the error and dismiss welcome modal, then open sync modal after exit animation
    setSyncError(null);
    dismiss(() => {
      pushModal({ type: 'sync' });
    });
    onDismiss();
  };

  const handleDismiss = () => {
    // Clear sync error when user dismisses welcome modal
    if (syncError) {
      setSyncError(null);
    }
    onDismiss();
  };

  return (
    <Modal
      visible={internalVisible}
      transparent={true}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent={true}
    >
      {/* iOS Modals render in a separate native window, so need their own SafeAreaProvider */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
          <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.contentWrapper,
                isLandscape && styles.contentWrapperLandscape,
                animatedContentStyle,
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.welcomeContainer} pointerEvents="box-none">
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
                  <Pressable
                    style={styles.syncErrorContainer}
                    onPress={handleReconnect}
                  >
                    <IconButton
                      icon={<SyncIcon size={iconSizes.medium} />}
                      variant="outline"
                    />
                    <Text
                      style={[
                        styles.syncErrorText,
                        { color: theme.colors.textInverted },
                      ]}
                    >
                      {syncError}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
            {miles > 0 && (
              <View
                style={[
                  styles.bottomProgressContainer,
                  { paddingHorizontal: spacing.xl },
                ]}
              >
                <JourneyProgressBar isLocked={false} darkMode />
              </View>
            )}
            {/* Sync indicator - matches MapScreen position */}
            <View style={styles.syncIndicatorContainer} pointerEvents="none">
              <SyncIndicator />
            </View>
          </SafeAreaView>
        </Animated.View>
      </SafeAreaProvider>
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
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrapperLandscape: {
    justifyContent: 'flex-start',
    paddingTop: spacing.sm,
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
    width: '100%',
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  syncIndicatorContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  syncErrorContainer: {
    flexDirection: 'row',
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
    flex: 1,
    opacity: 0.9,
  },
});
