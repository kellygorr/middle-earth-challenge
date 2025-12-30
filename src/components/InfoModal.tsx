import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import { TouchableWithoutFeedback } from 'react-native';
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
import { typography, typographyThemed } from '../styles/typography';
import { spacing, borderRadius, shadows } from '../styles/global';
import { useAnimatedModal } from '../hooks/useAnimatedModal';
import { motion } from '../styles/motion';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import checkpoints from '../constants/checkpoints.json';
import trivia from '../constants/trivia.json';
import Confetti from './Confetti';
import { CloseButton } from './ButtonIcons';
import JourneyProgressBar from './JourneyProgressBar';

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
  // Locked checkpoint mode: show limited info when tapping a future checkpoint
  const isLockedCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem &&
    (miles || 0) < (currentItem.CUMULATIVE_MILES || 0);
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
  const currentCheckpointNumberPre = getCheckpointNumber() + 1;
  const willConfettiRun =
    motion.flags.confettiEnabled &&
    isCheckpointPre &&
    currentCheckpointNumberPre === maxCompletedPre &&
    maxCompletedPre > 1 &&
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

    // Celebrate only the user's latest completed checkpoint,
    // excluding the first checkpoint (no confetti for new game).
    const maxCompleted = checkpointCompletions.length
      ? Math.max(...checkpointCompletions.map(c => c.checkpointNumber ?? 0))
      : 0;
    const currentCheckpointNumber = getCheckpointNumber() + 1;
    const isLatestCheckpoint =
      isCheckpoint &&
      currentCheckpointNumber === maxCompleted &&
      maxCompleted > 1 &&
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

  // Calculate progress to next checkpoint (and static span between checkpoints)
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
          spanMiles: span,
          currentCumulativeMiles: currentCM,
        };
      }
    }
    return {
      percentage: 100,
      nextCheckpointNumber: null,
      milesToNext: null,
      spanMiles: null,
      currentCumulativeMiles: null,
    };
  };

  // Journey progress should reflect the user's current walked miles
  const getProgressInfo = () => {
    const walkedMiles = Math.max(0, Math.min(miles ?? 0, TOTAL_JOURNEY_MILES));
    const progressPercentage = Math.round(
      (walkedMiles / TOTAL_JOURNEY_MILES) * 100,
    );
    return { progressMiles: walkedMiles, progressPercentage };
  };

  const progressInfo = getProgressInfo();

  // Trivia between previous and current checkpoint (inclusive of current)
  const getSegmentTrivia = () => {
    if (itemType !== 'checkpoint' || !('CUMULATIVE_MILES' in currentItem)) {
      return [] as Array<any>;
    }
    const idx = getCheckpointNumber();
    const currentCM = checkpoints[idx]?.CUMULATIVE_MILES ?? 0;
    const prevCM = idx > 0 ? checkpoints[idx - 1].CUMULATIVE_MILES : -Infinity;
    const items = (trivia as Array<any>).filter(t => {
      const mile = Number(t.CUMULATIVE_MILES ?? -Infinity);
      return mile > prevCM && mile <= currentCM;
    });
    items.sort(
      (a, b) => Number(a.CUMULATIVE_MILES) - Number(b.CUMULATIVE_MILES),
    );
    return items;
  };

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
                  typographyThemed(theme).titleMediumInverted,
                  styles.title,
                ]}
              >
                {itemType === 'checkpoint'
                  ? `Checkpoint #${getCheckpointNumber() + 1}`
                  : currentItem.name}
              </Text>

              <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
                {/* Close button */}
                <Pressable style={styles.closeButton} onPress={handleDismiss}>
                  {({ pressed }) => (
                    <CloseButton
                      size={32}
                      color={pressed ? theme.colors.buttonPressed : theme.colors.textPrimary}
                    />
                  )}
                </Pressable>

                {/* Scrollable Content */}
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={[styles.scrollContent]}
                  showsVerticalScrollIndicator={false}
                  bounces={true}
                  scrollEventThrottle={16}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Location name */}
                  <Text
                    style={[
                      typographyThemed(theme).titleMediumPrimary,
                      styles.locationName,
                    ]}
                  >
                    {currentItem.name}
                  </Text>

                  {itemType === 'checkpoint' && isLockedCheckpoint ? (
                    <View style={styles.lockedSectionContainer}>
                      <View
                        style={[
                          styles.lockedCenterContainer,
                          { backgroundColor: theme.colors.infoModalInactive },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            styles.lockedBannerText,
                            { color: theme.colors.checkpointLabel },
                          ]}
                        >
                          Checkpoint locked
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Description (hidden for locked checkpoints) */}
                  {!isLockedCheckpoint && currentItem.description?.text && (
                    <Text
                      style={[
                        typographyThemed(theme).bodySecondary,
                        styles.description,
                      ]}
                    >
                      {currentItem.description.text}
                    </Text>
                  )}

                  {/* Image if available (hidden for locked checkpoints) */}
                  {!isLockedCheckpoint && currentItem.description?.image && (
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
                          style={[typographyThemed(theme).captionSecondary]}
                        >
                          {currentItem.CUMULATIVE_MILES} miles
                        </Text>
                      </View>
                    )}
                  {/* Previous trivia (under description/image) */}
                  {itemType === 'checkpoint' &&
                    (() => {
                      // Show previous trivia only after this checkpoint is completed/reached
                      const isCompleted =
                        'CUMULATIVE_MILES' in currentItem &&
                        (miles || 0) >= (currentItem.CUMULATIVE_MILES || 0);
                      if (!isCompleted) return null;
                      const segmentTrivia = getSegmentTrivia();
                      return segmentTrivia.length ? (
                        <View style={styles.triviaSection}>
                          <Text
                            style={[
                              typographyThemed(theme).captionPrimary,
                              styles.triviaTitle,
                            ]}
                          >
                            Trivia
                          </Text>
                          <View style={styles.triviaList}>
                            {segmentTrivia.map(t => (
                              <View key={t.name} style={styles.triviaItemRow}>
                                <Text
                                  style={[
                                    typographyThemed(theme).bodyPrimary,
                                    styles.triviaItemName,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {t.name}
                                </Text>
                                {'CUMULATIVE_MILES' in t && (
                                  <Text
                                    style={[
                                      typographyThemed(theme).captionSecondary,
                                      styles.triviaItemMile,
                                    ]}
                                  >
                                    {t.CUMULATIVE_MILES} miles
                                  </Text>
                                )}
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null;
                    })()}
                </ScrollView>

                {/* Miles section */}
                {itemType === 'checkpoint' &&
                  (() => {
                    const cp = getCheckpointProgress();
                    if (typeof cp.spanMiles !== 'number') return null;
                    const showLeft =
                      typeof cp.currentCumulativeMiles === 'number' &&
                      cp.currentCumulativeMiles > 0;
                    const targetMiles = (currentItem as any)
                      .CUMULATIVE_MILES as number;
                    const remaining = Math.max(0, targetMiles - (miles || 0));
                    return (
                      <View style={styles.milesToNextSection}>
                        <View
                          style={[styles.milesTwoColRow, styles.milesTitleRow]}
                        >
                          <View
                            style={styles.milesCol}
                            pointerEvents={showLeft ? 'auto' : 'none'}
                          >
                            <Text
                              style={[
                                typographyThemed(theme).captionPrimaryBold,
                                styles.milesToNextTitle,
                                !showLeft ? styles.hidden : null,
                              ]}
                            >
                              Checkpoint
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.milesCol,
                              { marginLeft: spacing.md },
                            ]}
                          >
                            <Text
                              style={[
                                typographyThemed(theme).captionPrimaryBold,
                                styles.milesToNextTitle,
                                isLockedCheckpoint
                                  ? { color: theme.colors.infoModalInactive }
                                  : null,
                              ]}
                            >
                              {isLockedCheckpoint
                                ? 'Remaining'
                                : 'Next checkpoint'}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.milesTwoColRow,
                            { marginTop: spacing.xs },
                          ]}
                        >
                          <View
                            style={styles.milesCol}
                            pointerEvents={showLeft ? 'auto' : 'none'}
                          >
                            <View
                              style={[
                                styles.milesToNextPill,
                                {
                                  backgroundColor:
                                    theme.colors.checkpointTextBackground,
                                },
                                !showLeft ? styles.hidden : null,
                              ]}
                            >
                              <Text
                                style={[
                                  typography.titleLarge,
                                  styles.milesToNextValue,
                                  { color: theme.colors.checkpointLabel },
                                ]}
                              >
                                {cp.currentCumulativeMiles}
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
                          <View
                            style={[
                              styles.milesCol,
                              { marginLeft: spacing.md },
                            ]}
                          >
                            <View
                              style={[
                                styles.milesToNextPill,
                                {
                                  backgroundColor: isLockedCheckpoint
                                    ? theme.colors.infoModalInactive
                                    : theme.colors.checkpointTextBackground,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typography.titleLarge,
                                  styles.milesToNextValue,
                                  { color: theme.colors.checkpointLabel },
                                ]}
                              >
                                {isLockedCheckpoint
                                  ? '-' + remaining
                                  : cp.spanMiles}
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
                        </View>
                      </View>
                    );
                  })()}

                {/* Progress - Journey at bottom of modal */}
                {itemType === 'checkpoint' && progressInfo && (
                  <View style={styles.bottomProgressSection}>
                    {(() => {
                      const firstName = checkpoints[0]?.name;
                      const lastName = checkpoints[checkpoints.length - 1]?.name;
                      return (
                        <JourneyProgressBar
                          leftLabel={firstName}
                          rightLabel={lastName}
                          progressPercentage={progressInfo.progressPercentage}
                          isLocked={!!isLockedCheckpoint}
                        />
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
  lockedSectionContainer: {
    alignSelf: 'stretch',
    flexGrow: 1,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },

  lockedBannerText: {
    fontWeight: '600',
  },
  // Miles to Next section
  milesToNextSection: {
    alignItems: 'stretch',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  milesTwoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  milesTitleRow: {
    alignItems: 'flex-end',
  },
  milesCol: {
    flex: 1,
  },
  milesToNextTitle: {
    marginBottom: 4,
    textAlign: 'left',
  },
  milesToNextValue: {
    textAlign: 'left',
  },
  milesToNextValueRight: {
    textAlign: 'right',
  },
  milesToNextPill: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  milesCenterWrapper: {
    alignItems: 'center',
  },
  milesCenteredTitle: {
    textAlign: 'center',
  },
  milesCenterPill: {
    alignItems: 'center',
    marginTop: spacing.xs,
    width: 'auto',
    paddingHorizontal: spacing.md,
  },
  milesCenteredText: {
    textAlign: 'center',
  },
  hidden: {
    opacity: 0,
  },
  singleColRight: {
    alignItems: 'flex-end',
  },
  milesSuffix: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
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
    ...shadows.large,
    paddingTop: spacing.xl2, // Standardized 40px top padding using token
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  triviaSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  triviaTitle: {
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  triviaList: {
    gap: spacing.xs,
  },
  triviaItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  triviaItemName: {
    flex: 1,
    marginRight: spacing.sm,
  },
  triviaItemMile: {
    textAlign: 'right',
  },

  lockedCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
  },

  milesContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
});
