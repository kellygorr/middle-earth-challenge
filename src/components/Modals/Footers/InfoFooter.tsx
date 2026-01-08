/**
 * InfoFooter - Footer component for the Info modal.
 * Displays the journey progress bar at the bottom.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '../../../styles/global';
import { useInfoStore } from '../../../stores/infoStore';
import { useProgressStore } from '../../../stores/progressStore';
import JourneyProgressBar from '../../JourneyProgressBar';

export default function InfoFooter() {
  const { currentItem, itemType } = useInfoStore();

  // Check if this is a locked checkpoint
  const isLockedCheckpoint =
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem &&
    useProgressStore
      .getState()
      .isLockedCheckpoint(currentItem.CUMULATIVE_MILES || 0);

  return (
    <View style={styles.container}>
      <JourneyProgressBar
        isLocked={itemType === 'checkpoint' && !!isLockedCheckpoint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
