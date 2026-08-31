import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { useTheme } from '../stores/settingsStore';
import { typographyThemed } from '../styles/typography';
import { spacing } from '../styles/global';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import { motion } from '../styles/motion';
import Button from '../components/Buttons';
import { useProgressStore } from '../stores/progressStore';
import JourneyProgressBar from '../components/JourneyProgressBar';
import SyncIndicator from '../components/SyncIndicator';
import SyncErrorBanner from '../components/SyncErrorBanner';
import SettingsRef from '../components/SettingsRef';

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
  const isLandscape = width > height;
  const miles = useProgressStore(state => state.miles) || 0;
  const hasSyncIssues = useProgressStore(state =>
    state.syncIssues.some(
      issue => issue.dismissedAt === null && issue.resolvedAt === null,
    ),
  );

  // Measure the journey progress bar so the absolutely-positioned sync
  // pill can sit exactly above it without overlapping.
  const [progressBarHeight, setProgressBarHeight] = React.useState(0);

  const { internalVisible, animatedBackgroundStyle, animatedContentStyle } =
    useAnimatedModal(visible, {
      translateDistance: 0, // fade-only for welcome
      entranceDelay: motion.modal.entranceDelay,
      entranceDuration: motion.modal.entranceDuration,
      exitDuration: motion.modal.exitDuration,
      easing: motion.easing.standard,
    });

  const handleDismiss = () => {
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
                  Middle Earth Challenge
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    typographyThemed(theme).subtitleLargeInverted,
                  ]}
                >
                  Walk from Bag End to Mount Doom
                </Text>
                <Button
                  onPress={handleDismiss}
                  variant={theme.name === 'classic' ? 'primary' : 'brand'}
                  size="large"
                >
                  {miles > 0 ? 'Continue journey' : 'Begin journey'}
                </Button>

                {/* Persistent sync-error card (any kind). Has its own
                    × dismiss; we deliberately do NOT clear it when the
                    welcome modal closes — the badge dot on Settings
                    should keep reflecting the unresolved problem. */}
                {hasSyncIssues && (
                  <View style={styles.bannerWrap}>
                    <SyncErrorBanner bleed={spacing.xl} />
                    <Text
                      style={[
                        typographyThemed(theme).caption2Inverted,
                        styles.bannerHint,
                      ]}
                    >
                      Troubleshooting history is available in{' '}
                      <SettingsRef
                        size={12}
                        color={theme.colors.textInverted}
                      />
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
            {/* Sync indicator: absolutely positioned so it does not affect
                the centering of the welcome content above. Sits just above
                the journey progress bar when present, otherwise at the
                bottom of the safe area. */}
            <View
              style={[
                styles.syncIndicatorContainer,
                {
                  bottom:
                    miles > 0 ? progressBarHeight + spacing.lg : spacing.md,
                },
              ]}
              pointerEvents="none"
            >
              <SyncIndicator />
            </View>
            {miles > 0 ? (
              <View
                style={[
                  styles.bottomProgressContainer,
                  { paddingHorizontal: spacing.xl },
                ]}
                onLayout={e =>
                  setProgressBarHeight(e.nativeEvent.layout.height)
                }
              >
                <JourneyProgressBar darkMode />
              </View>
            ) : (
              /* First-run: reassure the user that they don't need to
                 connect a health app to use the app. Occupies the same
                 bottom slot as the progress bar (mutually exclusive with
                 miles > 0). Doesn't affect sync — auto-sync still runs
                 on dismiss if a provider was previously connected. */
              <View style={styles.bottomHintContainer} pointerEvents="none">
                <Text
                  style={[styles.hint, typographyThemed(theme).captionInverted]}
                >
                  Health data integration is optional and can be connected at
                  any time for automatic tracking.
                </Text>
              </View>
            )}
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
    // Take the full modal width; otherwise the parent's alignItems:center
    // shrinks this box to its narrowest child (the button), and the sync
    // error banner below then collapses to that same skinny width.
    width: '100%',
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    marginBottom: spacing.md,
  },
  subtitle: {
    marginBottom: spacing.xxl,
  },
  bottomProgressContainer: {
    width: '100%',
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  bottomHintContainer: {
    width: '100%',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  syncIndicatorContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bannerWrap: {
    width: '100%',
    marginTop: spacing.xl,
  },
  bannerHint: {
    marginTop: spacing.xs,
    textAlign: 'left',
  },
  hint: {
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.8,
  },
});
