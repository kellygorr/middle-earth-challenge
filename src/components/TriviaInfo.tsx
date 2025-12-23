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

export default function TriviaInfo() {
  // This component is now replaced by InfoModal
  return null;
}

  useEffect(() => {
    expandProgress.value = withTiming(isExpanded ? 1 : 0, {
      duration: motion.modal.entranceDuration,
    });
  }, [isExpanded, expandProgress]);

  // Animated styles
  const animatedContainerStyle = useAnimatedStyle(() => {
    const height = interpolate(
      expandProgress.value,
      [0, 1],
      [0, 140], // Slightly taller than checkpoint for more content
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      expandProgress.value,
      [0, 0.3, 1],
      [0, 0, 1],
      Extrapolation.CLAMP,
    );

    return {
      height,
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.accent,
        },
        animatedContainerStyle,
      ]}
    >
      <View style={styles.content}>
        {/* Trivia location name */}
        <Text
          style={[
            typography.subtitle,
            styles.title,
            { color: theme.colors.textPrimary },
          ]}
        >
          {currentItem.name}
        </Text>

        {/* Description */}
        {currentItem.description?.text && (
          <Text
            style={[
              typography.body,
              styles.description,
              { color: theme.colors.textSecondary },
            ]}
            numberOfLines={4}
            ellipsizeMode="tail"
          >
            {currentItem.description.text}
          </Text>
        )}

        {/* Miles marker */}
        <View style={styles.milesContainer}>
          <Text
            style={[
              typography.caption,
              styles.milesText,
              { color: theme.colors.accent },
            ]}
          >
            {currentItem.CUMULATIVE_MILES} miles
          </Text>
        </View>
      </View>
    </Animated.View>
  );
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
  milesContainer: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  milesText: {
    fontStyle: 'italic',
  },
});
