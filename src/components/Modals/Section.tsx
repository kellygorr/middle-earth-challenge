/**
 * Section - Wrapper for modal content sections with consistent spacing.
 * First section has no top margin, subsequent sections get a gap.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../../styles/global';

interface SectionProps {
  children: React.ReactNode;
  /** First section in a modal - no top margin */
  first?: boolean;
  /** Additional styles */
  style?: ViewStyle;
}

export default function Section({ children, first, style }: SectionProps) {
  return <View style={[!first && styles.gap, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  gap: {
    marginTop: spacing.lg,
  },
});
