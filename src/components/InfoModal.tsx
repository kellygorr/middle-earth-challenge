import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Image,
  ScrollView,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTheme } from '../stores/settingsStore';
import { useInfoStore } from '../stores/infoStore';
import { useProgressStore } from '../stores/progressStore';
import { typography } from '../styles/typography';
import { spacing, shadows, borderRadius } from '../styles/global';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import { motion } from '../styles/motion';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpoints from '../constants/checkpoints.json';
import Confetti from './Confetti';

// Centralized timings and flags
const CONFETTI_MAX_MS = motion.confetti.maxRunMs;

interface InfoModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function InfoModal({ visible, onDismiss }: InfoModalProps) {
  const theme = useTheme();
  const { currentItem, itemType } = useInfoStore();
  const { checkpointCompletions, miles } = useProgressStore();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
  const containerHeight = Math.round(safeHeight * 0.8);

  // System Reduce Motion gating (used to predict confetti and animation mode)
  const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    return () => {
      mounted = false;
      // @ts-ignore
      sub?.remove?.();
    };
  }, []);

  // Helper function to get checkpoint number for display
  const getCheckpointNumber = useCallback(() => {
    if (
      itemType === 'checkpoint' &&
      currentItem &&
      'CUMULATIVE_MILES' in currentItem
    ) {
      const checkpointIndex = checkpoints.findIndex(
        cp => cp.CUMULATIVE_MILES === currentItem.CUMULATIVE_MILES,
      );
      return checkpointIndex >= 0 ? checkpointIndex : 0;
    }
    return 0;
  }, [itemType, currentItem]);

  // Predict whether confetti will run to choose animation mode
  const isCheckpointPre =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem;
  const maxCompletedPre = checkpointCompletions.length
    ? Math.max(...checkpointCompletions.map(c => c.checkpointNumber ?? 0))
    : 0;
  const nextToUnlockPre = maxCompletedPre + 1;
  const currentCheckpointNumberPre = getCheckpointNumber() + 1;
  const willConfettiRun =
    motion.flags.confettiEnabled &&
    isCheckpointPre &&
    currentCheckpointNumberPre === nextToUnlockPre &&
    currentCheckpointNumberPre > 1 &&
    !reduceMotionEnabled;

  // Use shared modal hook; slide+fade unless confetti will run (fade-only)
  const {
    internalVisible,
    animatedBackgroundStyle: animatedOverlayStyle,
    animatedContentStyle,
    contentOpacitySV,
  } = useAnimatedModal(visible, {
    translateDistance: willConfettiRun
      ? 0
      : motion.modal.translateDistanceDefault,
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
  });

  // Animate card background and shadow with content to avoid shadow-only frames
  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  // Confetti animation trigger state
  const [showConfetti, setShowConfetti] = React.useState(false);

  const handleDismiss = useCallback(() => {
    setShowConfetti(false);
    if (onDismiss) onDismiss();
  }, [onDismiss]);

  // getCheckpointNumber defined above

  // Confetti timer and concurrent behavior
  const confettiCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open/close modal immediately based on visible
  useEffect(() => {
    if (!visible) {
      setShowConfetti(false);
    }
  }, [visible]);

  // Run confetti concurrently when modal is open (on top layer)
  useEffect(() => {
    if (confettiCloseTimer.current) {
      clearTimeout(confettiCloseTimer.current);
      confettiCloseTimer.current = null;
    }

    const isCheckpoint =
      itemType === 'checkpoint' &&
      currentItem &&
      'CUMULATIVE_MILES' in currentItem;

    // Celebrate only the user's latest checkpoint (next to unlock),
    // excluding the first checkpoint (no confetti for new game).
    const maxCompleted = checkpointCompletions.length
      ? Math.max(...checkpointCompletions.map(c => c.checkpointNumber ?? 0))
      : 0;
    const nextToUnlock = maxCompleted + 1;
    const currentCheckpointNumber = getCheckpointNumber() + 1;
    const isLatestCheckpoint =
      isCheckpoint &&
      currentCheckpointNumber === nextToUnlock &&
      currentCheckpointNumber > 1 &&
      !reduceMotionEnabled;

    if (internalVisible && motion.flags.confettiEnabled && isLatestCheckpoint) {
      setShowConfetti(true);
      confettiCloseTimer.current = setTimeout(() => {
        setShowConfetti(false);
      }, CONFETTI_MAX_MS);
    } else {
      setShowConfetti(false);
    }

    return () => {
      if (confettiCloseTimer.current) clearTimeout(confettiCloseTimer.current);
    };
  }, [
    internalVisible,
    itemType,
    currentItem,
    checkpointCompletions,
    getCheckpointNumber,
    reduceMotionEnabled,
  ]);

  if (!currentItem || !itemType) {
    return null;
  }

  // Calculate progress to next checkpoint
  const getCheckpointProgress = () => {
    if (itemType === 'checkpoint' && 'CUMULATIVE_MILES' in currentItem) {
      const currentCheckpointIndex = getCheckpointNumber();
      const nextCheckpointIndex = currentCheckpointIndex + 1;

      if (nextCheckpointIndex < checkpoints.length) {
        const currentCM = checkpoints[currentCheckpointIndex].CUMULATIVE_MILES;
        const nextCM = checkpoints[nextCheckpointIndex].CUMULATIVE_MILES;
        const span = Math.max(1, nextCM - currentCM);
        const through = Math.max(0, Math.min((miles ?? 0) - currentCM, span));
        const percentage = Math.round((through / span) * 100);
        const milesToNext = Math.max(0, nextCM - (miles ?? 0));
        return {
          percentage,
          nextCheckpointNumber: nextCheckpointIndex + 1,
          milesToNext,
        };
      }
    }
    return { percentage: 100, nextCheckpointNumber: null, milesToNext: null };
  };

  // Calculate progress info for checkpoints
  const getProgressInfo = () => {
    if (itemType === 'checkpoint' && 'CUMULATIVE_MILES' in currentItem) {
      const progressMiles = currentItem.CUMULATIVE_MILES;
      const progressPercentage = Math.round(
        (progressMiles / TOTAL_JOURNEY_MILES) * 100,
      );
      return { progressMiles, progressPercentage };
    }
    return null;
  };

  const progressInfo = getProgressInfo();

  return (
    <>
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
            animatedOverlayStyle,
          ]}
        >
          {motion.flags.confettiEnabled ? (
            <Confetti show={showConfetti} />
          ) : null}
          <TouchableWithoutFeedback onPress={handleDismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          {/* Overlay and content only; confetti rendered in its own Modal below */}

          <SafeAreaView
            style={styles.safeArea}
            edges={['top', 'bottom']}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.contentWrapper,
                { height: containerHeight },
                animatedContentStyle,
              ]}
            >
              {/* Modal Title */}
              <Text
                style={[
                  typography.modalTitle,
                  styles.title,
                  shadows.text,
                  { color: theme.colors.textOnPrimary },
                ]}
              >
                {itemType === 'checkpoint'
                  ? `Checkpoint #${getCheckpointNumber() + 1}`
                  : currentItem.name}
              </Text>

              <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
                {/* Close button */}
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleDismiss}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      typography.modalTitle,
                      styles.closeButtonText,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>

                {/* Scrollable Content */}
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={true}
                  scrollEventThrottle={16}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Location name */}
                  <Text
                    style={[
                      typography.title,
                      styles.locationName,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    {currentItem.name}
                  </Text>

                  {/* Description */}
                  {currentItem.description?.text && (
                    <Text
                      style={[
                        typography.body,
                        styles.description,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {currentItem.description.text}
                    </Text>
                  )}

                  {/* Image if available */}
                  {currentItem.description?.image && (
                    <View style={styles.imageContainer}>
                      <Image
                        source={{ uri: currentItem.description.image }}
                        style={styles.image}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Miles marker for trivia */}
                  {itemType === 'trivia' &&
                    'CUMULATIVE_MILES' in currentItem && (
                      <View style={styles.milesContainer}>
                        <Text
                          style={[
                            typography.caption,
                            { color: theme.colors.textSecondary },
                          ]}
                        >
                          Mile {currentItem.CUMULATIVE_MILES}
                        </Text>
                      </View>
                    )}
                </ScrollView>

                {/* Miles to Next Checkpoint - standalone section above progress bars */}
                {itemType === 'checkpoint' &&
                  (() => {
                    const cp = getCheckpointProgress();
                    return typeof cp.milesToNext === 'number' ? (
                      <View style={styles.milesToNextSection}>
                        <Text
                          style={[
                            typography.caption,
                            styles.milesToNextTitle,
                            { color: theme.colors.textPrimary },
                          ]}
                        >
                          Miles to Next Checkpoint
                        </Text>
                        <View
                          style={[
                            styles.milesToNextPill,
                            {
                              backgroundColor:
                                theme.colors.checkpointTextBackground,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              typography.title,
                              styles.milesToNextValue,
                              { color: theme.colors.checkpointLabel },
                            ]}
                          >
                            {cp.milesToNext}
                            <Text
                              style={[
                                styles.milesSuffix,
                                { color: theme.colors.checkpointLabel },
                              ]}
                            >
                              miles
                            </Text>
                          </Text>
                        </View>
                      </View>
                    ) : null;
                  })()}

                {/* Progress bars for checkpoints - at bottom of modal */}
                {itemType === 'checkpoint' && progressInfo && (
                  <View style={styles.bottomProgressSection}>
                    {/* Next Checkpoint Progress */}
                    {(() => {
                      const checkpointProgress = getCheckpointProgress();
                      const currentIdx = getCheckpointNumber();
                      const nextIdx = currentIdx + 1;
                      const latestName = currentItem.name;
                      const nextName =
                        nextIdx < checkpoints.length
                          ? checkpoints[nextIdx].name
                          : undefined;

                      return nextName ? (
                        <View
                          style={[styles.progressSection, styles.progressRow]}
                        >
                          <View style={styles.progressLeft}>
                            <View style={styles.progressLabelRow}>
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressSideLabel,
                                  { color: theme.colors.textPrimary },
                                ]}
                              >
                                {latestName}
                              </Text>
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressSideLabel,
                                  { color: theme.colors.textPrimary },
                                ]}
                              >
                                {`${nextName} (Checkpoint #${nextIdx + 1})`}
                              </Text>
                            </View>
                            <View style={styles.progressBarContainer}>
                              <View
                                style={[
                                  styles.progressBarBackground,
                                  { backgroundColor: theme.colors.pathGrey },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.progressBarFill,
                                    {
                                      backgroundColor:
                                        theme.colors.checkpointUnlocked,
                                      width: `${checkpointProgress.percentage}%`,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.progressPercentFixed,
                              styles.progressPercentContainer,
                            ]}
                          >
                            <View
                              style={[
                                styles.progressPercentPillBox,
                                {
                                  backgroundColor:
                                    theme.colors.checkpointTextBackground,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressPercentageText,
                                  { color: theme.colors.checkpointLabel },
                                ]}
                              >
                                {checkpointProgress.percentage}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : null;
                    })()}

                    {/* Journey Progress */}
                    {(() => {
                      const firstName = checkpoints[0]?.name;
                      const lastName =
                        checkpoints[checkpoints.length - 1]?.name;
                      return (
                        <View
                          style={[styles.progressSection, styles.progressRow]}
                        >
                          <View style={styles.progressLeft}>
                            <View style={styles.progressLabelRow}>
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressSideLabel,
                                  { color: theme.colors.textPrimary },
                                ]}
                              >
                                {firstName}
                              </Text>
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressSideLabel,
                                  { color: theme.colors.textPrimary },
                                ]}
                              >
                                {lastName}
                              </Text>
                            </View>
                            <View style={styles.progressBarContainer}>
                              <View
                                style={[
                                  styles.progressBarBackground,
                                  { backgroundColor: theme.colors.pathGrey },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.progressBarFill,
                                    {
                                      backgroundColor:
                                        theme.colors.pathProgress,
                                      width: `${progressInfo.progressPercentage}%`,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.progressPercentFixed,
                              styles.progressPercentContainer,
                            ]}
                          >
                            <View
                              style={[
                                styles.progressPercentPillBox,
                                {
                                  backgroundColor:
                                    theme.colors.checkpointTextBackground,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typography.caption,
                                  styles.progressPercentageText,
                                  { color: theme.colors.checkpointLabel },
                                ]}
                              >
                                {progressInfo.progressPercentage}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          </SafeAreaView>
        </Animated.View>

        {/* Confetti Animation */}
        {/* {itemType === 'checkpoint' && <Confetti show={showConfetti} />} */}
      </Modal>

      {/* Confetti rendered within overlay (pointerEvents none) to avoid blocking taps */}
    </>
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
    maxWidth: 400,
    alignItems: 'flex-start',
  },
  // Miles to Next section
  milesToNextSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  milesToNextTitle: {
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  milesToNextValue: {
    textAlign: 'center',
  },
  milesToNextPill: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milesSuffix: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  titleText: {
    color: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 64, // Space for larger close button
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 40,
  },
  locationName: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  description: {
    marginBottom: spacing.lg,
    lineHeight: 24,
    textAlign: 'center',
  },
  imageContainer: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },
  bottomProgressSection: {
    padding: spacing.md,
  },
  progressSection: {
    marginBottom: spacing.md,
  },
  progressLabel: {
    marginBottom: spacing.xs,
    fontSize: 12,
    fontWeight: '500',
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressSideLabel: {
    fontSize: 12,
    fontWeight: '500',
    maxWidth: '48%',
    textAlign: 'left',
  },
  progressBarContainer: {
    marginTop: 0,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 0,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  progressPercentageText: {
    textAlign: 'right',
    fontSize: 14,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressLeft: {
    flex: 1,
  },
  progressPercentFixed: {
    width: 40,
    marginLeft: spacing.sm,
  },
  progressPercentPill: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  progressPercentContainer: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  progressPercentPillBox: {
    flex: 1,
    width: '100%',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },

  milesContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
});
