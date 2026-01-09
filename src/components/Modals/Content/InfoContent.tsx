/**
 * InfoContent - Content component for the Info modal (checkpoint/trivia details).
 * Extracted from InfoModal for use with SharedModal.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../../stores/settingsStore';
import { useInfoStore } from '../../../stores/infoStore';
import { useProgressStore } from '../../../stores/progressStore';
import { useUIStore } from '../../../stores/uiStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, borderRadius } from '../../../styles/global';
import { motion } from '../../../styles/motion';
import { LockedCheckpointBanner } from '../LockedCheckpointBanner';
import { TrackingOptions } from '../../TrackingOptions';
import { MilesDisplay } from '../MilesDisplay';
import TriviaListItem from '../TriviaListItem';

const CELEBRATION_MAX_MS = motion.checkpointCelebration.maxRunMs;

// Checkpoint image mapping - require() must be static
const checkpointImages: Record<string, any> = {
  'hobbiton.jpg': require('../../../assets/checkpoints/hobbiton.jpg'),
  'bree.jpg': require('../../../assets/checkpoints/bree.jpg'),
  'rivendell.jpg': require('../../../assets/checkpoints/rivendell.jpg'),
  'lothlorien.jpg': require('../../../assets/checkpoints/lothlorien.jpg'),
  'parth-galen.jpg': require('../../../assets/checkpoints/parth-galen.jpg'),
  'the-black-gates.jpg': require('../../../assets/checkpoints/the-black-gates.jpg'),
  'minas-morgul.jpg': require('../../../assets/checkpoints/minas-morgul.jpg'),
  'mount-doom.jpg': require('../../../assets/checkpoints/mount-doom.jpg'),
};

// Trivia image mapping - require() must be static
const triviaImages: Record<string, any> = {
  'the-old-forest.jpg': require('../../../assets/trivia/the-old-forest.jpg'),
  'weathertop.jpg': require('../../../assets/trivia/weathertop.jpg'),
  'hollin-gate.jpg': require('../../../assets/trivia/hollin-gate.jpg'),
  'khazad-dum.jpg': require('../../../assets/trivia/khazad-dum.jpg'),
  'the-argonath.jpg': require('../../../assets/trivia/the-argonath.jpg'),
  'emyn-muil.jpg': require('../../../assets/trivia/emyn-muil.jpg'),
  'dead-marshes.jpg': require('../../../assets/trivia/dead-marshes.jpg'),
  'shelobs-lair.jpg': require('../../../assets/trivia/shelobs-lair.jpg'),
  'gorgoroth.jpg': require('../../../assets/trivia/gorgoroth.jpg'),
};

export default function InfoContent() {
  const theme = useTheme();

  // Get item from modal params - this is the source of truth
  const modalStack = useUIStore(state => state.modalStack);
  const currentModal = modalStack[modalStack.length - 1];
  const modalParams = currentModal?.params;

  const currentItem = modalParams?.item ?? null;
  const itemType = modalParams?.itemType ?? null;

  const openInfoModal = useInfoStore(state => state.openInfoModal);
  const setShowCelebration = useInfoStore(state => state.setShowCelebration);
  const shouldShowCheckpointCelebration = useProgressStore(
    state => state.shouldShowCheckpointCelebration,
  );
  const getPreviousTrivia = useProgressStore(state => state.getPreviousTrivia);
  const pushModal = useUIStore(state => state.pushModal);
  const closeAllModals = useUIStore(state => state.closeAllModals);

  // Celebration timer ref
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Locked checkpoint mode: show limited info when tapping a future checkpoint
  const isLockedCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem &&
    useProgressStore
      .getState()
      .isLockedCheckpoint(currentItem.CUMULATIVE_MILES || 0);

  // Show tracking options on first checkpoint (Hobbiton)
  const isFirstCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'isStart' in currentItem &&
    currentItem.isStart === true;
  const showTrackingOptions = isFirstCheckpoint;

  // Trigger celebration for latest completed checkpoint
  useEffect(() => {
    // Clean up previous timer
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }

    const isCheckpoint =
      itemType === 'checkpoint' &&
      currentItem &&
      'CUMULATIVE_MILES' in currentItem;

    const currentIdx = isCheckpoint ? currentItem.index ?? -1 : -1;
    const isLatestCheckpoint =
      isCheckpoint && shouldShowCheckpointCelebration(currentIdx);

    if (motion.flags.checkpointCelebrationEnabled && isLatestCheckpoint) {
      // Start celebration
      setShowCelebration(true);
      // Auto-stop after max duration
      celebrationTimerRef.current = setTimeout(() => {
        setShowCelebration(false);
      }, CELEBRATION_MAX_MS);
    } else {
      setShowCelebration(false);
    }

    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
      // Clear celebration when unmounting
      setShowCelebration(false);
    };
  }, [
    currentItem,
    itemType,
    shouldShowCheckpointCelebration,
    setShowCelebration,
  ]);

  // Get previous trivia for unlocked checkpoints
  const previousTrivia = (() => {
    if (itemType !== 'checkpoint' || isLockedCheckpoint) return null;
    const idx = Number(currentItem?.index ?? -1);
    if (!Number.isFinite(idx) || idx <= 0) return null;
    const trivia = getPreviousTrivia(idx);
    return trivia && trivia.length > 0 ? trivia : null;
  })();

  // Handle dismiss for TrackingOptions callback
  // Uses closeAllModalsWithCallback to run callback after animation completes
  const handleDismiss = (afterCallback?: () => void) => {
    if (afterCallback) {
      useUIStore.getState().closeAllModalsWithCallback(afterCallback);
    } else {
      closeAllModals();
    }
  };

  if (!currentItem || !itemType) {
    return null;
  }

  return (
    <>
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
        <Text style={[typographyThemed(theme).bodyPrimary, styles.description]}>
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
              <TriviaListItem
                key={`${t.name}:${i}`}
                name={t.name}
                miles={t.CUMULATIVE_MILES}
                onPress={() => openInfoModal(t, 'trivia')}
              />
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
            onOpenSyncModal={() => pushModal({ type: 'sync' })}
          />
        )}

        {/* Miles display */}
        <MilesDisplay />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomSection: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    gap: spacing.md,
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
  triviaSection: {},
  triviaTitle: {
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  triviaList: {
    gap: spacing.xs,
  },
});
