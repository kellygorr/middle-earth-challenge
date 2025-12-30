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
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
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
// TOTAL_JOURNEY_MILES not needed; journey progress computed via store selectors
import CelebrationBorder from './CelebrationBorder';
import { CloseButton } from './ButtonIcons';
import JourneyProgressBar from './JourneyProgressBar';

// Centralized timings and flags
const CELEBRATION_MAX_MS = motion.checkpointCelebration.maxRunMs;

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
    useProgressStore
      .getState()
      .isLockedCheckpoint((currentItem as any).CUMULATIVE_MILES || 0);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
  const containerHeight = Math.round(safeHeight * 0.8);

  // System Reduce Motion gating (used to predict celebration and animation mode)
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

  // Use store selectors for checkpoint indexes and progress
  const getCheckpointIndexForCumulativeMiles = useProgressStore(
    state => state.getCheckpointIndexForCumulativeMiles,
  );
  const getLatestCompletedCheckpointNumber = useProgressStore(
    state => state.getLatestCompletedCheckpointNumber,
  );
  const getCheckpointProgressFor = useProgressStore(
    state => state.getCheckpointProgressFor,
  );
  const getRemainingMilesTo = useProgressStore(
    state => state.getRemainingMilesTo,
  );
  const getSegmentTriviaForCheckpointIndex = useProgressStore(
    state => state.getSegmentTriviaForCheckpointIndex,
  );
  const shouldShowCheckpointCelebration = useProgressStore(
    state => state.shouldShowCheckpointCelebration,
  );

  // Celebration will run when the current checkpoint equals the latest completed (excluding the first)

  // Use shared modal hook; slide+fade unless celebration will run (fade-only)
  const {
    internalVisible,
    animatedBackgroundStyle: animatedOverlayStyle,
    animatedContentStyle,
    contentOpacitySV,
  } = useAnimatedModal(visible, {
    translateDistance: motion.modal.translateDistanceDefault,
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
  });

  // Animate card background and shadow with content to avoid shadow-only frames
  const animatedCardStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

  // Celebration animation trigger state
  const [showCheckpointCelebration, setShowCheckpointCelebration] =
    React.useState(false);
  const celebrationStartRaf = useRef<number | null>(null);

  const handleDismiss = useCallback(() => {
    setShowCheckpointCelebration(false);
    if (onDismiss) onDismiss();
  }, [onDismiss]);

  // getCheckpointNumber defined above

  // Celebration timer and concurrent behavior
  const celebrationCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Open/close modal immediately based on visible
  // Removed direct dependency on `visible` to avoid race conditions
  // Celebration visibility is controlled by `internalVisible` and selector gating

  // Run celebration concurrently when modal is open (on top layer)
  useEffect(() => {
    if (celebrationCloseTimer.current) {
      clearTimeout(celebrationCloseTimer.current);
      celebrationCloseTimer.current = null;
    }

    const isCheckpoint =
      itemType === 'checkpoint' &&
      currentItem &&
      'CUMULATIVE_MILES' in currentItem;

    // Celebrate only the user's latest completed checkpoint,
    // excluding the first checkpoint (no celebration for new game).
    const currentIdx = isCheckpoint
      ? getCheckpointIndexForCumulativeMiles(
          (currentItem as any).CUMULATIVE_MILES,
        )
      : -1;
    const isLatestCheckpoint =
      isCheckpoint && shouldShowCheckpointCelebration(currentIdx);

    if (
      internalVisible &&
      motion.flags.checkpointCelebrationEnabled &&
      isLatestCheckpoint
    ) {
      // Defer to next frame to avoid mount timing races
      if (celebrationStartRaf.current) {
        cancelAnimationFrame(celebrationStartRaf.current);
        celebrationStartRaf.current = null;
      }
      celebrationStartRaf.current = requestAnimationFrame(() => {
        setShowCheckpointCelebration(() => true);
      });
      celebrationCloseTimer.current = setTimeout(() => {
        setShowCheckpointCelebration(() => false);
      }, CELEBRATION_MAX_MS);
    } else {
      setShowCheckpointCelebration(() => false);
    }

    return () => {
      if (celebrationCloseTimer.current)
        clearTimeout(celebrationCloseTimer.current);
      if (celebrationStartRaf.current) {
        cancelAnimationFrame(celebrationStartRaf.current);
        celebrationStartRaf.current = null;
      }
    };
  }, [
    internalVisible,
    itemType,
    currentItem,
    checkpointCompletions,
    getCheckpointIndexForCumulativeMiles,
    shouldShowCheckpointCelebration,
    reduceMotionEnabled,
    getLatestCompletedCheckpointNumber,
  ]);

  if (!currentItem || !itemType) {
    return null;
  }

  // Checkpoint progress moved to store selector; Journey progress handled by JourneyProgressBar

  // Trivia between previous and current checkpoint (inclusive of current)
  // Segment trivia retrieval moved to progressStore

  return (
    <>
      <Modal
        visible={internalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={handleDismiss}
        statusBarTranslucent={true}
      >
        {/* Celebration border will render above the overlay later */}
        <Animated.View
          style={[
            styles.overlay,
            {
              backgroundColor: showCheckpointCelebration
                ? theme.colors.modalCelebrationGold
                : theme.colors.modalOverlay,
            },
            animatedOverlayStyle,
          ]}
        >
          {/* Celebration moved to root of Modal for top-level layering */}
          <TouchableWithoutFeedback onPress={handleDismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          {/* Overlay and content; celebration rendered here after content for top layering */}

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
                  ? `Checkpoint #${
                      getCheckpointIndexForCumulativeMiles(
                        (currentItem as any).CUMULATIVE_MILES,
                      ) + 1
                    }`
                  : currentItem.name}
              </Text>

              <Animated.View
                style={[
                  styles.modalContainer,
                  animatedCardStyle,
                  styles.modalCardDefault,
                ]}
              >
                {/* Close button */}
                <Pressable style={styles.closeButton} onPress={handleDismiss}>
                  {({ pressed }) => (
                    <CloseButton
                      size={32}
                      color={
                        pressed
                          ? theme.colors.buttonPressed
                          : theme.colors.textPrimary
                      }
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
                      const segmentTrivia = getSegmentTriviaForCheckpointIndex(
                        getCheckpointIndexForCumulativeMiles(
                          (currentItem as any).CUMULATIVE_MILES,
                        ),
                      );
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
                    const currentIdx = getCheckpointIndexForCumulativeMiles(
                      (currentItem as any).CUMULATIVE_MILES,
                    );
                    const cp = getCheckpointProgressFor(currentIdx);
                    if (typeof cp.spanMiles !== 'number') return null;
                    const showLeft =
                      typeof cp.currentCumulativeMiles === 'number' &&
                      cp.currentCumulativeMiles > 0;
                    const targetMiles = (currentItem as any)
                      .CUMULATIVE_MILES as number;
                    const remaining = getRemainingMilesTo(targetMiles);
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
                {itemType === 'checkpoint' && (
                  <View style={styles.bottomProgressSection}>
                    {(() => {
                      return (
                        <JourneyProgressBar isLocked={!!isLockedCheckpoint} />
                      );
                    })()}
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          </SafeAreaView>

          {/* Celebration border is the chosen celebration effect */}
        </Animated.View>

        {/* Animated gradient border on top of modal */}
        {motion.flags.checkpointCelebrationEnabled &&
        itemType === 'checkpoint' ? (
          <CelebrationBorder
            show={showCheckpointCelebration}
            borderWidth={5}
            cycleDurationMs={3000}
          />
        ) : null}
      </Modal>

      {/* Celebration rendered within overlay (pointerEvents none) to avoid blocking taps */}
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

  milesToNextPill: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
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
  modalCardDefault: {
    backgroundColor: 'rgba(255,255,255,0.95)',
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
