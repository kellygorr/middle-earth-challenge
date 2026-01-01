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
import { useTheme, useSettingsStore } from '../../stores/settingsStore';
import { modalStyles, modalConstants } from '../../styles/modalStyles';
import { useUIStore } from '../../stores/uiStore';
import { useInfoStore } from '../../stores/infoStore';
import { useProgressStore } from '../../stores/progressStore';
import { typography, typographyThemed } from '../../styles/typography';
import {
  spacing,
  borderRadius,
  iconSizes,
  iconButtonSizes,
} from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
// TOTAL_JOURNEY_MILES not needed; journey progress computed via store selectors
import CelebrationBorder from '../CelebrationBorder';
import {
  CloseButton,
  SyncButton,
  PlusButton,
  SettingsButton,
  DevModeButton,
} from '../ButtonIcons';
import JourneyProgressBar from '../JourneyProgressBar';
import SyncOptionsModal from './SyncOptionsModal';
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
  const getRemainingMilesTo = useProgressStore(
    state => state.getRemainingMilesTo,
  );
  const shouldShowCheckpointCelebration = useProgressStore(
    state => state.shouldShowCheckpointCelebration,
  );
  const getPointFromIndex = useProgressStore(state => state.getPointFromIndex);
  const getPreviousTrivia = useProgressStore(state => state.getPreviousTrivia);
  const setCurrentItem = useInfoStore(state => state.setCurrentItem);
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const devMode = useSettingsStore(state => state.devMode);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const setShowSettings = useUIStore(state => state.setShowSettings);

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
                  {(() => {
                    const idx = currentItem.index;
                    const n =
                      typeof idx === 'number' && idx >= 0 ? idx + 1 : undefined;
                    if (itemType === 'checkpoint') {
                      return typeof n === 'number'
                        ? `Checkpoint #${n}`
                        : 'Checkpoint';
                    }
                    return 'Trivia';
                  })()}
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
                      {(() => {
                        const idx = currentItem.index;
                        const n =
                          typeof idx === 'number' && idx >= 0
                            ? idx + 1
                            : undefined;
                        if (itemType === 'checkpoint') {
                          return typeof n === 'number'
                            ? `Checkpoint #${n}`
                            : 'Checkpoint';
                        }
                        return 'Trivia';
                      })()}
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
                    contentContainerStyle={[
                      modalStyles.scrollContent,
                      showTrackingOptions &&
                        styles.scrollContentWithTrackingOptions,
                    ]}
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
                          typographyThemed(theme).bodyPrimary,
                          styles.description,
                        ]}
                      >
                        {currentItem.description.text}
                      </Text>
                    )}

                    {/* Tracking options for first checkpoint - after description */}
                    {showTrackingOptions && (
                      <View style={styles.trackingOptionsContainer}>
                        {/* Sync button when not synced, Settings button when synced */}
                        {!syncEnabled ? (
                          <Pressable
                            style={styles.trackingOption}
                            onPress={() => {
                              // Close checkpoint modal, then open sync options modal
                              onDismiss();
                              setShowSyncOptions(true);
                            }}
                          >
                            <View style={styles.trackingButtonContainer}>
                              <SyncButton size={iconSizes.medium} />
                            </View>
                            <Text
                              style={[
                                typographyThemed(theme).captionSecondary,
                                styles.trackingOptionText,
                              ]}
                            >
                              Sync health data from device (optional). Manage
                              this at any time from Settings
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            style={styles.trackingOption}
                            onPress={() => {
                              handleDismiss();
                              setShowSettings(true);
                            }}
                          >
                            <View style={styles.trackingButtonContainer}>
                              <SettingsButton size={iconSizes.medium} />
                            </View>
                            <Text
                              style={[
                                typographyThemed(theme).captionSecondary,
                                styles.trackingOptionText,
                              ]}
                            >
                              Health sync enabled. Tap to manage sync in
                              Settings
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.trackingOption}
                          onPress={() => {
                            handleDismiss();
                            // Open miles modal
                            useUIStore.getState().setShowMilesModal(true);
                          }}
                        >
                          <View style={styles.trackingButtonContainer}>
                            <PlusButton size={iconSizes.medium} />
                          </View>
                          <Text
                            style={[
                              typographyThemed(theme).captionSecondary,
                              styles.trackingOptionText,
                            ]}
                          >
                            Manually add or edit miles
                          </Text>
                        </Pressable>
                        {/* Dev mode option - toggle on/off */}
                        <Pressable
                          style={styles.trackingOption}
                          onPress={() => {
                            setDevMode(!devMode);
                          }}
                        >
                          <View style={styles.trackingButtonContainer}>
                            <DevModeButton
                              size={iconSizes.medium}
                              variant={devMode ? 'brand' : 'primary'}
                            />
                          </View>
                          <Text
                            style={[
                              typographyThemed(theme).captionSecondary,
                              styles.trackingOptionText,
                            ]}
                          >
                            {devMode
                              ? 'Dev mode is enabled. Tap to disable'
                              : 'Not ready to commit? Explore the map in dev mode'}
                          </Text>
                        </Pressable>
                      </View>
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
                    {itemType === 'checkpoint' &&
                      !isLockedCheckpoint &&
                      (() => {
                        const idx = Number(currentItem.index ?? -1);
                        if (!Number.isFinite(idx) || idx <= 0) return null;
                        const previousTrivia = getPreviousTrivia(idx);
                        if (!previousTrivia || previousTrivia.length === 0) {
                          return null;
                        }
                        return (
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
                                    <Text style={styles.milesSuffix}>
                                      {' '}
                                      miles
                                    </Text>
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        );
                      })()}
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
                    const nextCheckpointMiles = (() => {
                      const m = Number(nextCheckpoint?.CUMULATIVE_MILES ?? NaN);
                      return Number.isFinite(m) ? m : null;
                    })();
                    const milesToNextCheckpoint =
                      nextCheckpointMiles !== null
                        ? Math.max(1, nextCheckpointMiles - checkpointMiles)
                        : null;
                    const remaining =
                      !isCheckpointView && nextCheckpointMiles !== null
                        ? Math.round(getRemainingMilesTo(nextCheckpointMiles))
                        : Math.round(getRemainingMilesTo(milesVal));
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
                              {isCheckpointView ? 'Checkpoint' : 'Total miles'}
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
                            style={[
                              styles.milesCol,
                              { marginLeft: spacing.md },
                            ]}
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
                                  : milesToNextCheckpoint ?? remaining}
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
                      isLocked={
                        itemType === 'checkpoint' && !!isLockedCheckpoint
                      }
                    />
                  </View>
                </Animated.View>
              </View>
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

      {/* Sync options modal */}
      <SyncOptionsModal
        visible={showSyncOptions}
        onDismiss={() => setShowSyncOptions(false)}
      />

      {/* Celebration rendered within overlay (pointerEvents none) to avoid blocking taps */}
    </>
  );
}

const styles = StyleSheet.create({
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
  scrollContentWithTrackingOptions: {
    flexGrow: 1,
  },
  trackingOptionsContainer: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  trackingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trackingButtonContainer: {
    width: iconButtonSizes.medium,
    height: iconButtonSizes.medium,
    borderRadius: borderRadius.full,
  },
  trackingOptionText: {
    textAlign: 'left',
    flex: 1,
    flexShrink: 1,
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
