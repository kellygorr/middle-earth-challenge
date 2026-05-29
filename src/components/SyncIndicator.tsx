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
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import {
  useProgressStore,
  selectSyncEtaSeconds,
} from '../stores/progressStore';
import { spacing, borderRadius } from '../styles/global';
import { CHUNK_DAYS } from '../constants/sync';

const MIN_DISPLAY_TIME = 1000; // Minimum time to show indicator (ms)

interface SyncIndicatorProps {
  style?: object;
}

export default function SyncIndicator({ style }: SyncIndicatorProps) {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const syncStatus = useProgressStore(state => state.syncStatus);

  // Pill is shown for the entire sync window (including long syncs) plus a
  // brief moment for non-permission errors so the user sees the failure.
  const isSyncing = syncStatus.phase === 'syncing';
  const isTransientError =
    syncStatus.phase === 'error' &&
    !!syncStatus.error &&
    syncStatus.error.kind !== 'permission';
  const showPill = isSyncing || isTransientError;

  // Build the message text. Line 1 is always the top-level state. Line 2
  // carries progress / ETA / error detail. Both are centered in the pill.
  const units = useMiles ? 'miles' : 'kilometers';
  let lineOne: string;
  let lineTwo: string | null;
  if (isSyncing) {
    lineOne = `Syncing ${units}`;
    if (syncStatus.chunksTotal > 1) {
      const eta = selectSyncEtaSeconds(syncStatus);
      const etaLabel =
        eta !== null && eta > 0
          ? eta < 60
            ? ` ~${eta}s left`
            : ` ~${Math.ceil(eta / 60)}m left`
          : '';
      // Translate opaque chunk progress into something the user understands:
      // approx days of health data caught up so far / total in this sync.
      const daysDone = syncStatus.chunksDone * CHUNK_DAYS;
      const daysTotal = syncStatus.chunksTotal * CHUNK_DAYS;
      const dayWord = daysTotal === 1 ? 'day' : 'days';
      lineTwo = `${daysDone} of ${daysTotal} ${dayWord}${etaLabel}`;
    } else {
      lineTwo = null;
    }
  } else if (isTransientError && syncStatus.error?.kind === 'timeout') {
    lineOne = 'Sync is taking a while';
    lineTwo = null;
  } else if (isTransientError && syncStatus.error?.kind === 'stalled') {
    lineOne = 'Sync stalled';
    lineTwo = 'Will retry';
  } else {
    lineOne = 'Sync hit a snag';
    lineTwo = null;
  }

  const [isVisible, setIsVisible] = useState(false);
  const showTimeRef = useRef<number>(0);

  // Opacity animation - fade in/out based on showPill
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (showPill) {
      showTimeRef.current = Date.now();
      setIsVisible(true);
      opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
    } else if (isVisible) {
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
  }, [showPill, opacity, isVisible]);

  // Rotating animation for sync icon
  const syncRotation = useSharedValue(0);

  useEffect(() => {
    if (showPill) {
      const interval = setInterval(() => {
        syncRotation.value = withTiming(syncRotation.value + 45, {
          duration: 150,
          easing: Easing.out(Easing.ease),
        });
      }, 350);
      return () => clearInterval(interval);
    }
  }, [showPill, syncRotation]);

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
        <View style={styles.textColumn}>
          <Text
            style={[styles.text, { color: theme.colors.checkpointLabel }]}
            numberOfLines={1}
          >
            {lineOne}
          </Text>
          {lineTwo && (
            <Text
              style={[
                styles.textSecondary,
                { color: theme.colors.checkpointLabel },
              ]}
              numberOfLines={1}
            >
              {lineTwo}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Default positioning - can be overridden via style prop.
    flexShrink: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
    flexShrink: 1,
  },
  textColumn: {
    flexShrink: 1,
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  textSecondary: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.85,
    flexShrink: 1,
  },
});
