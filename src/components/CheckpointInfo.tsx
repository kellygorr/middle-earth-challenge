import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '../stores/settingsStore';
import { useInfoStore } from '../stores/infoStore';
import { typography } from '../styles/typography';
import { spacing, borderRadius, shadows } from '../styles/global';
import { motion } from '../styles/motion';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';

export default function CheckpointInfo() {
  // This component is now replaced by InfoModal
  return null;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderTopWidth: 0, // Connects to button above
    borderRadius: borderRadius.md,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'hidden',
    ...shadows.medium,
  },
  content: {
    padding: spacing.md,
    flex: 1,
  },
  title: {
    marginBottom: spacing.xs,
  },
  description: {
    flex: 1,
    marginBottom: spacing.xs,
    fontSize: 14,
    lineHeight: 18,
  },
  progressContainer: {
    marginTop: spacing.xs,
  },
});
