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
// PointType import not needed here after store-based lookups

// Centralized timings and flags
const CELEBRATION_MAX_MS = motion.checkpointCelebration.maxRunMs;

interface InfoModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function InfoModal({ visible, onDismiss }: InfoModalProps) {
  const theme = useTheme();
  const { currentItem, itemType } = useInfoStore();
  const { checkpointCompletions } = useProgressStore();
  // Locked checkpoint mode: show limited info when tapping a future checkpoint
  const isLockedCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem &&
    useProgressStore
      .getState()
      .isLockedCheckpoint(currentItem.CUMULATIVE_MILES || 0);
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
  const getLatestCompletedCheckpointNumber = useProgressStore(
    state => state.getLatestCompletedCheckpointNumber,
  );
  const getRemainingMilesTo = useProgressStore(
    state => state.getRemainingMilesTo,
  );
  const shouldShowCheckpointCelebration = useProgressStore(
    state => state.shouldShowCheckpointCelebration,
  );
  const getPointFromIndex = useProgressStore(state => state.getPointFromIndex);
  // const getCurrentCheckpoint = useProgressStore(
  //   state => state.getCurrentCheckpoint,
  // );

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
    const currentIdx = isCheckpoint ? currentItem.index ?? -1 : -1;
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
    shouldShowCheckpointCelebration,
    reduceMotionEnabled,
    getLatestCompletedCheckpointNumber,
  ]);

  if (!currentItem || !itemType) {
    return null;
  }

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
                {(() => {
                  const idx = currentItem.index;
                  const n =
                    typeof idx === 'number' && idx >= 0 ? idx + 1 : undefined;
                  if (itemType === 'checkpoint') {
                    return typeof n === 'number'
                      ? `Checkpoint #${n}`
                      : 'Checkpoint';
                  }
                  return typeof n === 'number' ? `Trivia #${n}` : 'Trivia';
                })()}
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

                  {/* Previous trivia list removed during cleanup */}
                </ScrollView>

                {/* Miles section */}
                {(() => {
                  const isCheckpointView = itemType === 'checkpoint';
                  const milesVal = currentItem.CUMULATIVE_MILES as number;
                  const index = currentItem.index ?? -1;
                  if (index < 0) return null;
                  const nextCheckpoint = getPointFromIndex(
                    index + 1,
                    'checkpoint',
                  );
                  const nextCheckpointName = nextCheckpoint?.name ?? null;
                  // Keep lookup for potential future use; no longer needed for miles-to-next
                  // const currentCheckpoint = getCurrentCheckpoint();
                  const checkpointMiles = milesVal;
                  const leftColumn =
                    Number.isFinite(checkpointMiles) && checkpointMiles > 0;
                  const nextCheckpointMiles = ((): number | null => {
                    const m = Number(nextCheckpoint?.CUMULATIVE_MILES ?? NaN);
                    return Number.isFinite(m) ? m : null;
                  })();
                  const milesToNextCheckpoint = nextCheckpointMiles
                    ? Math.max(1, nextCheckpointMiles - checkpointMiles)
                    : null;

                  if (milesToNextCheckpoint === null) return null;
                  const remaining =
                    !isCheckpointView && nextCheckpointMiles !== null
                      ? getRemainingMilesTo(nextCheckpointMiles)
                      : getRemainingMilesTo(milesVal);
                  return (
                    <View style={styles.milesToNextSection}>
                      <View
                        style={[styles.milesTwoColRow, styles.milesTitleRow]}
                      >
                        <View
                          style={styles.milesCol}
                          pointerEvents={leftColumn ? 'auto' : 'none'}
                        >
                          <Text
                            style={[
                              typographyThemed(theme).captionPrimaryBold,
                              styles.milesToNextTitle,
                              isCheckpointView && isLockedCheckpoint
                                ? { color: theme.colors.infoModalInactive }
                                : null,
                              !leftColumn ? styles.hidden : null,
                            ]}
                          >
                            Checkpoint
                          </Text>
                        </View>
                        <View
                          style={[styles.milesCol, { marginLeft: spacing.md }]}
                        >
                          <Text
                            style={[
                              typographyThemed(theme).captionPrimaryBold,
                              styles.milesToNextTitle,
                              isCheckpointView && isLockedCheckpoint
                                ? { color: theme.colors.infoModalInactive }
                                : null,
                            ]}
                          >
                            {isCheckpointView && isLockedCheckpoint
                              ? 'Remaining'
                              : nextCheckpointName || 'Next checkpoint'}
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
                          pointerEvents={leftColumn ? 'auto' : 'none'}
                        >
                          <View
                            style={[
                              styles.milesToNextPill,
                              {
                                backgroundColor:
                                  isCheckpointView && isLockedCheckpoint
                                    ? theme.colors.infoModalInactive
                                    : theme.colors.checkpointTextBackground,
                              },
                              !leftColumn ? styles.hidden : null,
                            ]}
                          >
                            <Text
                              style={[
                                typography.titleLarge,
                                styles.milesToNextValue,
                                { color: theme.colors.checkpointLabel },
                              ]}
                            >
                              {checkpointMiles}
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
                          style={[styles.milesCol, { marginLeft: spacing.md }]}
                        >
                          <View
                            style={[
                              styles.milesToNextPill,
                              {
                                backgroundColor:
                                  isCheckpointView && isLockedCheckpoint
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
                              {isCheckpointView && isLockedCheckpoint
                                ? '-' + remaining
                                : milesToNextCheckpoint}
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
                <View style={styles.bottomProgressSection}>
                  <JourneyProgressBar
                    isLocked={itemType === 'checkpoint' && !!isLockedCheckpoint}
                  />
                </View>
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
