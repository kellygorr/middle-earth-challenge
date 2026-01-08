import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { spacing, borderRadius } from '../styles/global';

const MIN_DISPLAY_TIME = 1000; // Minimum time to show indicator (ms)

interface SyncIndicatorProps {
  style?: object;
}

export default function SyncIndicator({ style }: SyncIndicatorProps) {
  const theme = useTheme();
  const syncMessage = useProgressStore(state => state.syncMessage);
  const [isVisible, setIsVisible] = useState(false);
  const showTimeRef = useRef<number>(0);

  // Debug logging
  useEffect(() => {
    console.log('[SyncIndicator] syncMessage changed:', syncMessage);
  }, [syncMessage]);

  // Opacity animation - fade in/out based on syncMessage
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (syncMessage) {
      showTimeRef.current = Date.now();
      setIsVisible(true);
      opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
    } else if (isVisible) {
      // Only fade out if we were visible (prevents initial null trigger)
      const elapsed = Date.now() - showTimeRef.current;
      const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsed);

      const fadeOut = () => {
        opacity.value = withTiming(
          0,
          {
            duration: 200,
            easing: Easing.out(Easing.ease),
          },
          finished => {
            if (finished) {
              runOnJS(setIsVisible)(false);
            }
          },
        );
      };

      if (remainingTime > 0) {
        const timeout = setTimeout(fadeOut, remainingTime);
        return () => clearTimeout(timeout);
      } else {
        fadeOut();
      }
    }
  }, [syncMessage, opacity, isVisible]);

  // Rotating animation for sync icon - step-based rotation in a circle
  const syncRotation = useSharedValue(0);

  useEffect(() => {
    if (syncMessage) {
      // Step rotation: move 45 degrees every 350ms
      const interval = setInterval(() => {
        syncRotation.value = withTiming(syncRotation.value + 45, {
          duration: 150,
          easing: Easing.out(Easing.ease),
        });
      }, 350);
      return () => clearInterval(interval);
    }
    // Don't reset rotation when exiting - let it fade out at current position
  }, [syncMessage, syncRotation]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const syncIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, style, containerStyle]}>
      <View
        style={[
          styles.content,
          { backgroundColor: theme.colors.checkpointTextBackground },
        ]}
      >
        <Animated.View style={syncIconStyle}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12H20C20 7.58 16.42 4 12 4Z"
              fill={theme.colors.checkpointLabel}
            />
            <Path
              d="M12 20V23L16 19L12 15V18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20Z"
              fill={theme.colors.checkpointLabel}
            />
          </Svg>
        </Animated.View>
        <Text style={[styles.text, { color: theme.colors.checkpointLabel }]}>
          Syncing miles...
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Default positioning - can be overridden via style prop
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
