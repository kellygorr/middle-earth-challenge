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
  onReady?: () => void;
  /**
   * Fires once the exit fade animation has fully finished after `visible`
   * becomes false (i.e. once `internalVisible` — which useAnimatedModal
   * only flips false after both the content and background fades have
   * completed — settles). The parent should keep this component mounted
   * until this fires, rather than unmounting it the instant `visible`
   * becomes false; unmounting immediately skips the exit animation
   * entirely (React removes the whole subtree before its effects can
   * run), which is what caused welcome-dismiss to look like an instant
   * cut/flash to whatever renders underneath instead of a smooth fade.
   */
  onExited?: () => void;
  startupOverlay?: React.ReactNode;
}

export default function WelcomeModal({
  visible,
  onDismiss,
  onReady,
  onExited,
  startupOverlay,
}: WelcomeModalProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const miles = useProgressStore(state => state.miles) || 0;
  const hasTroubleshootingIssues = useProgressStore(state =>
    state.troubleshootingIssues.some(
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
  const modalVisible = visible || internalVisible || startupOverlay != null;

  // Notify the parent once the exit fade has genuinely finished, so it
  // can safely unmount this component. `internalVisible` transitions
  // true shortly after mount (entrance) and false again only once the
  // exit animation's fade-out chain completes — never on the very first
  // render, since it starts false. Gating on "was true, now false, and
  // still not asked to be visible" avoids firing this on initial mount.
  const hasBeenVisibleRef = React.useRef(false);
  React.useEffect(() => {
    if (internalVisible) {
      hasBeenVisibleRef.current = true;
      return;
    }
    if (hasBeenVisibleRef.current && !visible) {
      hasBeenVisibleRef.current = false;
      onExited?.();
    }
  }, [internalVisible, visible, onExited]);

  // Reports readiness once the entrance animation finishes, so the splash
  // overlay (rendered via startupOverlay) can fade out only after the
  // welcome content is actually visible underneath it.
  const readyFiredRef = React.useRef(false);
  React.useEffect(() => {
    if (!visible) {
      readyFiredRef.current = false;
      return;
    }
    if (!internalVisible || readyFiredRef.current) return;
    const readyTimer = setTimeout(
      () => {
        readyFiredRef.current = true;
        onReady?.();
      },
      motion.modal.entranceDelay + motion.modal.entranceDuration,
    );
    return () => clearTimeout(readyTimer);
  }, [visible, internalVisible, onReady]);

  return (
    <Modal
      visible={modalVisible}
      transparent={true}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent={true}
    >
      <View style={styles.modalRoot}>
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
                  {hasTroubleshootingIssues && (
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
                    style={[
                      styles.hint,
                      typographyThemed(theme).captionInverted,
                    ]}
                  >
                    Health data integration is optional and can be connected at
                    any time for automatic tracking
                  </Text>
                </View>
              )}
            </SafeAreaView>
          </Animated.View>
        </SafeAreaProvider>
        {startupOverlay}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
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
    width: '100%',
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.8,
  },
});
