import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  AccessibilityInfo,
  Image,
} from 'react-native';
import { TouchableWithoutFeedback } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { modalStyles, modalConstants } from '../../styles/modalStyles';
import { useInfoStore } from '../../stores/infoStore';
import { useProgressStore } from '../../stores/progressStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes, borderRadius } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
// TOTAL_JOURNEY_MILES not needed; journey progress computed via store selectors
import CelebrationBorder from '../CelebrationBorder';
import { CloseButton } from '../ButtonIcons';
import JourneyProgressBar from '../JourneyProgressBar';
import SyncModal from './SyncModal';
import { LockedCheckpointBanner } from '../LockedCheckpointBanner';
import { TrackingOptions } from '../TrackingOptions';
import { MilesDisplay } from '../MilesDisplay';
// PointType import not needed here after store-based lookups

// Checkpoint image mapping - require() must be static
const checkpointImages: Record<string, any> = {
  'hobbiton.jpg': require('../../assets/checkpoints/hobbiton.jpg'),
  'bree.jpg': require('../../assets/checkpoints/bree.jpg'),
  'rivendell.jpg': require('../../assets/checkpoints/rivendell.jpg'),
  'lothlorien.jpg': require('../../assets/checkpoints/lothlorien.jpg'),
  'parth-galen.jpg': require('../../assets/checkpoints/parth-galen.jpg'),
  'the-black-gates.jpg': require('../../assets/checkpoints/the-black-gates.jpg'),
  'minas-morgul.jpg': require('../../assets/checkpoints/minas-morgul.jpg'),
  'mount-doom.jpg': require('../../assets/checkpoints/mount-doom.jpg'),
};

// Trivia image mapping - require() must be static
const triviaImages: Record<string, any> = {
  'the-old-forest.jpg': require('../../assets/trivia/the-old-forest.jpg'),
  'weathertop.jpg': require('../../assets/trivia/weathertop.jpg'),
  'hollin-gate.jpg': require('../../assets/trivia/hollin-gate.jpg'),
  'khazad-dum.jpg': require('../../assets/trivia/khazad-dum.jpg'),
  'the-argonath.jpg': require('../../assets/trivia/the-argonath.jpg'),
  'emyn-muil.jpg': require('../../assets/trivia/emyn-muil.jpg'),
  'dead-marshes.jpg': require('../../assets/trivia/dead-marshes.jpg'),
  'shelobs-lair.jpg': require('../../assets/trivia/shelobs-lair.jpg'),
  'gorgoroth.jpg': require('../../assets/trivia/gorgoroth.jpg'),
};

// Centralized timings and flags
const CELEBRATION_MAX_MS = motion.checkpointCelebration.maxRunMs;

interface InfoModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function InfoModal({ visible, onDismiss }: InfoModalProps) {
  const theme = useTheme();
  const { currentItem, itemType } = useInfoStore();
  // Locked checkpoint mode: show limited info when tapping a future checkpoint
  const isLockedCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem &&
    useProgressStore
      .getState()
      .isLockedCheckpoint(currentItem.CUMULATIVE_MILES || 0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const insets = useSafeAreaInsets();
  const safeHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
  const containerHeight = Math.round(
    safeHeight * modalConstants.portraitHeightRatio,
  );

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
  const shouldShowCheckpointCelebration = useProgressStore(
    state => state.shouldShowCheckpointCelebration,
  );
  const getPreviousTrivia = useProgressStore(state => state.getPreviousTrivia);
  const setCurrentItem = useInfoStore(state => state.setCurrentItem);

  // State for sync options modal
  const [showSyncOptions, setShowSyncOptions] = React.useState(false);

  // Show sync hint on first checkpoint (Hobbiton) when sync is not yet enabled
  const isFirstCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'isStart' in currentItem &&
    currentItem.isStart === true;
  // Always show tracking options on first checkpoint
  const showTrackingOptions = isFirstCheckpoint;
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
    shouldShowCheckpointCelebration,
    reduceMotionEnabled,
    getLatestCompletedCheckpointNumber,
  ]);

  if (!currentItem || !itemType) {
    return null;
  }

  // Pre-calculate values used in render
  const checkpointIndex = currentItem.index;
  const checkpointNumber =
    typeof checkpointIndex === 'number' && checkpointIndex >= 0
      ? checkpointIndex + 1
      : undefined;
  const modalTitle =
    itemType === 'checkpoint'
      ? typeof checkpointNumber === 'number'
        ? `Checkpoint #${checkpointNumber}`
        : 'Checkpoint'
      : 'Trivia';

  // Get previous trivia for unlocked checkpoints
  const previousTrivia = (() => {
    if (itemType !== 'checkpoint' || isLockedCheckpoint) return null;
    const idx = Number(currentItem.index ?? -1);
    if (!Number.isFinite(idx) || idx <= 0) return null;
    const trivia = getPreviousTrivia(idx);
    return trivia && trivia.length > 0 ? trivia : null;
  })();

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
            modalStyles.overlay,
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
            style={modalStyles.safeArea}
            edges={['top', 'bottom']}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                modalStyles.contentWrapper,
                { maxWidth: modalConstants.maxWidthNarrow },
                !isLandscape && { height: containerHeight },
                animatedContentStyle,
              ]}
            >
              {/* Portrait: Title above modal */}
              {!isLandscape && (
                <Text
                  style={[
                    typographyThemed(theme).titleMediumInverted,
                    modalStyles.title,
                  ]}
                >
                  {modalTitle}
                </Text>
              )}

              {/* Horizontal container: vertical title on left (landscape only) + modal card */}
              <View style={modalStyles.horizontalLayout}>
                {/* Vertical Title - Running up the left side (landscape only) */}
                {isLandscape && (
                  <View style={modalStyles.verticalTitleContainer}>
                    <Text
                      style={[
                        typographyThemed(theme).titleMediumInverted,
                        modalStyles.verticalTitle,
                      ]}
                    >
                      {modalTitle}
                    </Text>
                  </View>
                )}

                <Animated.View
                  style={[
                    modalStyles.modalContainer,
                    modalStyles.modalContainerSmallHeader,
                    animatedCardStyle,
                    modalStyles.modalCardDefault,
                  ]}
                >
                  {/* Close button */}
                  <CloseButton
                    style={modalStyles.closeButton}
                    size={iconSizes.medium}
                    onPress={handleDismiss}
                  />

                  {/* Scrollable Content */}
                  <ScrollView
                    style={modalStyles.scrollView}
                    contentContainerStyle={modalStyles.scrollContent}
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

                    {/* Checkpoint/Trivia image */}
                    {!isLockedCheckpoint &&
                      currentItem.description?.image &&
                      (checkpointImages[currentItem.description.image] ||
                        triviaImages[currentItem.description.image]) && (
                        <Image
                          source={
                            checkpointImages[currentItem.description.image] ||
                            triviaImages[currentItem.description.image]
                          }
                          style={styles.checkpointImage}
                        />
                      )}

                    {/* Description (hidden for locked checkpoints) */}
                    {!isLockedCheckpoint && currentItem.description?.text && (
                      <Text
                        style={[
                          typographyThemed(theme).bodyPrimary,
                          styles.description,
                        ]}
                      >
                        {currentItem.description.text}
                      </Text>
                    )}

                    {/* Previous trivia list */}
                    {previousTrivia && (
                      <View style={styles.triviaSection}>
                        <Text
                          style={[
                            typographyThemed(theme).captionPrimaryBold,
                            styles.triviaTitle,
                          ]}
                        >
                          Unlocked Trivia
                        </Text>
                        <View style={styles.triviaList}>
                          {previousTrivia.map((t, i) => (
                            <Pressable
                              key={`${t.name}:${i}`}
                              style={styles.triviaItemRow}
                              onPress={() => setCurrentItem(t, 'trivia')}
                            >
                              <Text
                                style={[
                                  typographyThemed(theme).bodySecondary,
                                  styles.triviaItemName,
                                ]}
                              >
                                {t.name}
                              </Text>
                              <Text
                                style={[
                                  typographyThemed(theme).bodySecondary,
                                  styles.triviaItemMile,
                                ]}
                              >
                                {t.CUMULATIVE_MILES}
                                <Text style={styles.milesSuffix}> miles</Text>
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Bottom section */}
                    <View style={styles.bottomSection}>
                      {/* Locked checkpoint message */}
                      {itemType === 'checkpoint' && isLockedCheckpoint && (
                        <LockedCheckpointBanner />
                      )}

                      {/* Tracking options for first checkpoint */}
                      {showTrackingOptions && (
                        <TrackingOptions
                          onDismiss={handleDismiss}
                          onOpenSyncModal={() => setShowSyncOptions(true)}
                        />
                      )}

                      {/* Miles display */}
                      <MilesDisplay />
                    </View>
                  </ScrollView>

                  {/* Progress - Journey at bottom of modal */}
                  <View style={styles.bottomProgressSection}>
                    <JourneyProgressBar
                      isLocked={
                        itemType === 'checkpoint' && !!isLockedCheckpoint
                      }
                    />
                  </View>
                </Animated.View>
              </View>
            </Animated.View>
          </SafeAreaView>
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

      {/* Sync modal */}
      <SyncModal
        visible={showSyncOptions}
        onDismiss={() => setShowSyncOptions(false)}
      />

      {/* Celebration rendered within overlay (pointerEvents none) to avoid blocking taps */}
    </>
  );
}

const styles = StyleSheet.create({
  // Bottom section - contains locked banner, tracking options, and miles display
  bottomSection: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  milesSuffix: {
    fontSize: 12,
    fontWeight: '600',
  },
  locationName: {
    textAlign: 'center',
  },
  description: {
    lineHeight: 24,
    textAlign: 'left',
  },
  checkpointImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 1,
    borderRadius: borderRadius.md,
  },
  bottomProgressSection: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  triviaSection: {},
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
});
