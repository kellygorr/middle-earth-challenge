/**
 * InfoFooter - Footer component for the Info modal.
 * Displays the journey progress bar at the bottom.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing } from '../../../styles/global';
import JourneyProgressBar from '../../JourneyProgressBar';

export default function InfoFooter() {
  return (
    <View style={styles.container}>
      <JourneyProgressBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
