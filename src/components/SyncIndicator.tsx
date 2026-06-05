import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import {
  useProgressStore,
  selectSyncEtaSeconds,
  type SyncStatus,
} from '../stores/progressStore';
import { spacing, borderRadius } from '../styles/global';
import { typographyThemed } from '../styles/typography';

const MIN_DISPLAY_TIME = 1000; // Hold every shown message for at least 1s.
const FADE_DURATION = 200;

interface SyncIndicatorProps {
  style?: object;
}

interface Message {
  lineOne: string;
  lineTwo: string | null;
}

/**
 * Build the message to show for the current sync state, or `null` if the
 * pill shouldn't be on screen. Every branch is explicit; there is no
 * generic fallback string (so we never flash "Sync hit a snag" by accident).
 *
 * - `syncing`            -> progress message
 * - `error: timeout`     -> "Sync is taking a while"
 * - `error: unavailable` -> "Sync unavailable"
 * - `error: permission`  -> handled by the Settings banner only (no pill)
 * - `error: unknown`     -> silent everywhere (logged elsewhere)
 * - any other phase      -> null
 */
function computeMessage(
  syncStatus: SyncStatus,
  useMiles: boolean,
): Message | null {
  if (syncStatus.phase === 'syncing') {
    const units = useMiles ? 'miles' : 'kilometers';
    if (syncStatus.chunksTotal <= 1) {
      return { lineOne: `Syncing ${units}`, lineTwo: null };
    }
    const eta = selectSyncEtaSeconds(syncStatus);
    // Keep the ETA suffix slot occupied even at 0s so the surrounding text
    // doesn't reflow on the final tick (otherwise the pill width shrinks
    // and the "X of Y parts" line visibly jumps right at the end of sync).
    const etaLabel =
      eta === null
        ? ''
        : eta < 60
        ? ` ~${Math.max(0, eta)}s left`
        : ` ~${Math.ceil(eta / 60)}m left`;
    const partWord = syncStatus.chunksTotal === 1 ? 'part' : 'parts';
    return {
      lineOne: `Syncing ${units}`,
      lineTwo: `${syncStatus.chunksDone} of ${syncStatus.chunksTotal} ${partWord}${etaLabel}`,
    };
  }
  if (syncStatus.phase === 'error' && syncStatus.error) {
    switch (syncStatus.error.kind) {
      case 'timeout':
        return { lineOne: 'Sync is taking a while', lineTwo: null };
      case 'unavailable':
        return { lineOne: 'Can’t connect to health app', lineTwo: null };
      // permission / unknown intentionally fall through to null.
      default:
        return null;
    }
  }
  return null;
}

export default function SyncIndicator({ style }: SyncIndicatorProps) {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const syncStatus = useProgressStore(state => state.syncStatus);

  const nextMessage = computeMessage(syncStatus, useMiles);

  // What's currently on screen. While `nextMessage` is non-null we keep
  // it in sync (instant swap — no fade between chunks). When `nextMessage`
  // goes null we schedule a fade-out but leave `displayed` set until the
  // fade finishes, so the user always sees the last real message — never
  // an empty pill, never a misleading default.
  const [displayed, setDisplayed] = useState<Message | null>(null);
  const shownAtRef = useRef(0);
  const opacity = useSharedValue(0);

  // Drive show/fade. `nextMessage` is a fresh object every render, but the
  // effect's body only does work when its values actually change, so the
  // extra runs are cheap. (Stringifying for the dep array would also work
  // but is uglier.)
  const nextKey = nextMessage
    ? `${nextMessage.lineOne}|${nextMessage.lineTwo ?? ''}`
    : null;
  useEffect(() => {
    if (nextMessage) {
      setDisplayed(nextMessage);
      shownAtRef.current = Date.now();
      opacity.value = withTiming(1, {
        duration: FADE_DURATION,
        easing: Easing.out(Easing.ease),
      });
      return;
    }
    // nextMessage is null. If nothing is displayed, nothing to do.
    if (!displayed) return;
    const remaining = Math.max(
      0,
      MIN_DISPLAY_TIME - (Date.now() - shownAtRef.current),
    );
    const timer = setTimeout(() => {
      opacity.value = withTiming(
        0,
        { duration: FADE_DURATION, easing: Easing.out(Easing.ease) },
        finished => {
          if (finished) runOnJS(setDisplayed)(null);
        },
      );
    }, remaining);
    return () => clearTimeout(timer);
    // `nextMessage` itself is a fresh object each render; key by its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey, opacity]);

  // Spin the icon while the pill is up. Runs on the UI thread so it keeps
  // spinning even when JS is briefly busy ingesting a chunk.
  const syncRotation = useSharedValue(0);
  useEffect(() => {
    if (displayed) {
      syncRotation.value = 0;
      syncRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false,
      );
      return () => {
        cancelAnimation(syncRotation);
      };
    }
  }, [displayed, syncRotation]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  const syncIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));

  if (!displayed) return null;

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
            style={[
              typographyThemed(theme).caption,
              styles.text,
              { color: theme.colors.checkpointLabel },
            ]}
            numberOfLines={1}
          >
            {displayed.lineOne}
          </Text>
          {displayed.lineTwo && (
            <Text
              style={[
                typographyThemed(theme).button,
                styles.textSecondary,
                { color: theme.colors.checkpointLabel },
              ]}
              numberOfLines={1}
            >
              {displayed.lineTwo}
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
    fontWeight: '600',
    flexShrink: 1,
  },
  textSecondary: {
    fontWeight: '500',
    opacity: 0.85,
    flexShrink: 1,
  },
});
