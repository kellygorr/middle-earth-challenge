import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import type { SyncError } from '../stores/progressStore';
import { typographyThemed } from '../styles/typography';
import { useUIStore } from '../stores/uiStore';
import { spacing, borderRadius } from '../styles/global';
import { SyncNowRow } from './SyncNowRow';
import Button from './Buttons/Button';
import { PlusIcon } from '../assets/icons';

/**
 * Per-kind copy for the persistent sync-error banner.
 *
 * `unknown` deliberately has no entry here — the store filters it out
 * before it ever reaches this component (see progressStore.setSyncStatus).
 * The default branch exists only as a safety net for future error kinds
 * that get added to the union but not classified here yet.
 *
 * The `showAddHint` flag opts a variant into the trailing "Manual entry is
 * always available" line rendered separately in the component (with an
 * inline `+` icon). We only surface that for permission errors, where the
 * automatic path is genuinely blocked — not for transient issues like
 * timeout, where nudging manual entry would misrepresent the state.
 */
function getCopy(
  error: SyncError,
): { headline: string; body: string; showAddHint: boolean } | null {
  switch (error.kind) {
    case 'permission':
      // Copy varies by source so we can name the exact permission the
      // user needs to re-grant. Only ever set for the currently-selected
      // source, so we don't have to worry about mismatched contexts.
      if (error.source === 'pedometer') {
        return {
          headline: 'Pedometer tracking is off',
          body:
            'The Physical activity permission was turned off or never granted, ' +
            'so we can’t count your steps. Turn it back on to resume.',
          showAddHint: true,
        };
      }
      if (error.source === 'both') {
        return {
          headline: 'Automatic tracking stopped',
          body:
            'Access to both Pedometer and Health Connect was removed. ' +
            'Choose a source in Sync settings to resume tracking.',
          showAddHint: true,
        };
      }
      return {
        headline: 'Disconnected from health data',
        body:
          'Your health app permission was revoked or never granted. ' +
          'Reconnect below to sync automatically.',
        showAddHint: true,
      };
    case 'sourceFallback':
      if (error.unavailableSource === 'pedometer') {
        return {
          headline: 'Switched to Health Connect',
          body:
            'Pedometer permission was removed, so Health Connect is now ' +
            'your tracking source.',
          showAddHint: false,
        };
      }
      return {
        headline: 'Switched to Pedometer',
        body:
          'Health Connect access was removed, so Pedometer is now your ' +
          'tracking source.',
        showAddHint: false,
      };
    case 'timeout':
      return {
        headline: 'Sync took too long',
        body:
          'Your health app took too long to return one of the date ranges we asked for. ' +
          'You haven’t lost any newly synced data, and we’ll pick up where the syncing left off.',
        showAddHint: false,
      };
    case 'unavailable':
      return {
        headline: 'Can’t connect to health app',
        body:
          Platform.OS === 'android'
            ? 'Health Connect is missing or out of date. Install or update it from the Play Store to sync your activity.'
            : 'Your health app isn’t available right now. We’ll keep trying.',
        showAddHint: false,
      };
    case 'provider':
      return {
        headline: 'Health sync failed',
        body:
          'Your health app could not return a complete activity update. ' +
          'Nothing from that date range was skipped; try syncing again.',
        showAddHint: false,
      };
    case 'pedometerStorage':
      return {
        headline: 'Pedometer storage failed',
        body:
          'A step sample could not be saved. Tracking is still running and ' +
          'will retry on the next sensor update.',
        showAddHint: false,
      };
    case 'backgroundDisabled':
      return {
        headline: 'Background updates are off',
        body:
          'iOS isn’t letting us refresh in the background, so new activity will only sync when you open the app. ' +
          'Turn on Background App Refresh in iOS Settings to fix this.',
        showAddHint: false,
      };
    case 'unknown':
    default:
      return null;
  }
}

/**
 * Format an epoch ms as a short absolute timestamp ("Today at 4:12 PM" /
 * "May 28 at 4:12 PM"). Absolute (not relative) because the banner can
 * live for days.
 */
function formatTimestamp(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (sameDay) return `Today at ${time}`;
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${date} at ${time}`;
}

/**
 * Persistent advisory card shown wherever the user can act on a sync
 * problem (Settings → Sync, eventually WelcomeModal). Subscribes to
 * `lastSyncError`; renders `null` when there is no error.
 *
 * Dismissal calls `clearLastSyncError`, which also clears the badge dot
 * on the Settings icon. A successful sync clears both automatically.
 */
export default function SyncErrorBanner() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const lastSyncError = useProgressStore(state => state.lastSyncError);
  const lastSyncErrorAt = useProgressStore(state => state.lastSyncErrorAt);
  const clearLastSyncError = useProgressStore(
    state => state.clearLastSyncError,
  );
  const pushModal = useUIStore(state => state.pushModal);

  if (!lastSyncError) return null;

  const copy = getCopy(lastSyncError);
  // Safety net: if we ever end up with an error kind we have no copy for,
  // render nothing rather than showing an empty card.
  if (!copy) return null;
  const { headline, body, showAddHint } = copy;
  const unitLabel = useMiles ? 'Miles' : 'Kilometers';
  const accent = '#F4B400'; // matches IconButton badge color

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: accent,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.textCol}>
          <Text
            style={[
              typographyThemed(theme).bodyPrimary,
              styles.headline,
              { color: theme.colors.textPrimary },
            ]}
          >
            {headline}
          </Text>
          <Text
            style={[
              typographyThemed(theme).body,
              { color: theme.colors.textPrimary },
            ]}
          >
            {body}
          </Text>
          {/* Manual-entry hint: only for kinds where the automatic path is
              actually blocked (permission). Unit is dynamic so we don't
              lie to km users. The inline plus icon mirrors the pattern
              used in SyncContentIOS's copy so the two references look
              like the same UI element. */}
          {showAddHint && (
            <Text
              style={[
                typographyThemed(theme).body,
                styles.addHint,
                { color: theme.colors.textPrimary },
              ]}
            >
              {`${unitLabel} can also be logged with the `}
              <View style={styles.inlinePlus}>
                <View style={styles.inlinePlusCircle}>
                  <PlusIcon size={8} color="#fff" />
                </View>
              </View>
              {' button.'}
            </Text>
          )}
          {/* Timestamp is suppressed for `permission` errors because
              trackingModeService restamps `lastSyncErrorAt` on every
              foreground reconciliation, which makes it read as "just
              now" every session and adds no signal. For transient kinds
              (timeout / unavailable / backgroundDisabled), the stamp
              reflects when the last failed sync tick happened and is
              actually useful. */}
          {lastSyncErrorAt !== null && lastSyncError.kind !== 'permission' && (
            <Text
              style={[
                typographyThemed(theme).caption,
                styles.timestamp,
                { color: theme.colors.textSecondary },
              ]}
            >
              {formatTimestamp(lastSyncErrorAt)}
            </Text>
          )}
        </View>
        <Pressable
          onPress={clearLastSyncError}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sync error"
          style={styles.dismissBtn}
        >
          <Text
            style={[
              typographyThemed(theme).subtitleLarge,
              { color: theme.colors.textSecondary },
            ]}
          >
            ×
          </Text>
        </Pressable>
      </View>
      {/* Per-error action row */}
      {lastSyncError.kind === 'timeout' && (
        <View style={styles.retry}>
          <SyncNowRow />
        </View>
      )}
      {lastSyncError.kind === 'provider' && (
        <View style={styles.retry}>
          <SyncNowRow />
        </View>
      )}
      {lastSyncError.kind === 'unavailable' && Platform.OS === 'android' && (
        <View style={styles.retry}>
          <Button
            variant="primary"
            size="small"
            onPress={() => {
              Linking.openURL(
                'market://details?id=com.google.android.apps.healthdata',
              ).catch(() => {
                // Play Store app missing (rare); fall back to the web URL
                // so the user still has a path to install/update.
                Linking.openURL(
                  'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata',
                ).catch(() => {
                  // Both failed; nothing useful left to do.
                });
              });
            }}
          >
            Open Play Store
          </Button>
        </View>
      )}
      {(lastSyncError.kind === 'permission' ||
        lastSyncError.kind === 'sourceFallback') && (
        <View style={styles.retry}>
          <Button
            variant="primary"
            size="small"
            onPress={() => pushModal({ type: 'sync' })}
          >
            Sync settings
          </Button>
        </View>
      )}
      {lastSyncError.kind === 'backgroundDisabled' && (
        <View style={styles.retry}>
          <Button
            variant="primary"
            size="small"
            onPress={() => {
              Linking.openSettings().catch(() => {
                // openSettings can reject on simulators or if no Settings
                // entry exists yet; nothing useful to do here besides
                // swallow so we don't crash the banner.
              });
            }}
          >
            Open iOS Settings
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderLeftWidth: 4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    // Tight breathing room top & bottom so the banner sits snug against
    // the surrounding modal content without looking marooned.
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  textCol: {
    flex: 1,
  },
  headline: {
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  // Trailing “you can always log manually” line. Small gap from the body
  // paragraph so it reads as an aside rather than the same sentence.
  addHint: {
    marginTop: spacing.xs,
  },
  // Inline `+` icon inside a run of Text — same shape as the plus button
  // on the map, at text-height. Duplicated from SyncContentIOS so we keep
  // this component self-contained. The 2px translateY nudges the circle
  // to sit on the text baseline rather than slightly above it.
  inlinePlus: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 2 }],
  },
  inlinePlusCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timestamp: {
    marginTop: spacing.xs,
  },
  retry: {
    marginTop: spacing.sm,
  },
  // Pedometer permission recovery row — mirrors the shape of the row
  // TrackingOptions renders for the health-app case (IconButton + text
  // in a Pressable) so both permission variants read as the same kind
  // of affordance.
  pedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pedRowText: {
    flex: 1,
    flexShrink: 1,
  },
  dismissBtn: {
    paddingHorizontal: spacing.xs,
    paddingTop: 0,
    marginTop: -spacing.xs,
  },
});
