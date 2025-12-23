import React, { useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { useInfoStore } from '../stores/infoStore';
import { useTheme } from '../stores/settingsStore';
import { CheckpointType } from '../types';
import { typography } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';
import { motion } from '../styles/motion';

interface InfoButtonProps {
  item: CheckpointType;
  type: 'checkpoint' | 'trivia';
  checkpointIndex?: number; // For checkpoint numbering
}

export default function InfoButton({
  item,
  type,
  checkpointIndex,
}: InfoButtonProps) {
  const { openModal, isModalVisible } = useInfoStore();
  const theme = useTheme();

  // Animation values
  const caretRotation = useSharedValue(isModalVisible ? 1 : 0);

  // Update animation when modal state changes
  useEffect(() => {
    caretRotation.value = withTiming(isModalVisible ? 1 : 0, {
      duration: motion.button.enterDuration,
    });
  }, [isModalVisible, caretRotation]);

  // Animated styles for caret rotation
  const animatedCaretStyle = useAnimatedStyle(() => {
    const rotation = interpolate(caretRotation.value, [0, 1], [0, 90]);
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  // Generate display text based on type
  const getDisplayText = () => {
    if (type === 'checkpoint') {
      const checkpointNumber =
        checkpointIndex !== undefined ? checkpointIndex + 1 : 1;
      return `Checkpoint #${checkpointNumber}`;
    } else {
      return item.name;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: theme.colors.checkpointTextBackground },
      ]}
      onPress={openModal}
      activeOpacity={0.7}
    >
      <Text
        style={[
          typography.label,
          styles.buttonText,
          { color: theme.colors.checkpointLabel },
        ]}
      >
        {getDisplayText()}
      </Text>
      <Animated.View style={[styles.caret, animatedCaretStyle]}>
        <Text
          style={[
            typography.label,
            styles.caretText,
            { color: theme.colors.checkpointLabel },
          ]}
        >
          ▶
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonText: {
    textAlign: 'left',
  },
  caret: {
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caretText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
