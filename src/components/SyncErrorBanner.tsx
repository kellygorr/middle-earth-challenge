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
import { TrackingOptions } from './TrackingOptions';
import { SyncNowRow } from './SyncNowRow';
import Button from './Buttons/Button';

/**
 * Per-kind copy for the persistent sync-error banner.
 *
 * `unknown` deliberately has no entry here — the store filters it out
 * before it ever reaches this component (see progressStore.setSyncStatus).
 * The default branch exists only as a safety net for future error kinds
 * that get added to the union but not classified here yet.
 */
function getCopy(
  error: SyncError,
  useMiles: boolean,
): { headline: string; body: string } | null {
  const unit = useMiles ? 'miles' : 'kilometers';
  switch (error.kind) {
    case 'permission':
      return {
        headline: 'Disconnected from health data',
        body:
          'Your health app permission was revoked or never granted. ' +
          'Reconnect below to sync automatically, or dismiss this and ' +
          `log ${unit} with the + button.`,
      };
    case 'timeout':
      return {
        headline: 'Sync took too long',
        body:
          'Your health app took too long to return one of the date ranges we asked for. ' +
          'You haven\u2019t lost any newly synced data, and we\u2019ll pick up where the syncing left off.',
      };
    case 'unavailable':
      return {
        headline: 'Can’t connect to health app',
        body:
          Platform.OS === 'android'
            ? 'Health Connect is missing or out of date. Install or update it from the Play Store to sync your activity.'
            : 'Your health app isn\u2019t available right now. We\u2019ll keep trying.',
      };
    case 'backgroundDisabled':
      return {
        headline: 'Background updates are off',
        body:
          'iOS isn\u2019t letting us refresh in the background, so new activity will only sync when you open the app. ' +
          'Turn on Background App Refresh in iOS Settings to fix this.',
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

  const copy = getCopy(lastSyncError, useMiles);
  // Safety net: if we ever end up with an error kind we have no copy for,
  // render nothing rather than showing an empty card.
  if (!copy) return null;
  const { headline, body } = copy;
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
          {lastSyncErrorAt !== null && (
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
              typographyThemed(theme).body,
              { color: theme.colors.textSecondary, fontSize: 20 },
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
      {lastSyncError.kind === 'permission' && (
        <View style={styles.retry}>
          <TrackingOptions
            showAddOption={false}
            showDevToggle={false}
            onOpenSyncModal={() => pushModal({ type: 'sync' })}
          />
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
    marginBottom: spacing.md,
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
  timestamp: {
    marginTop: spacing.xs,
  },
  retry: {
    marginTop: spacing.sm,
  },
  dismissBtn: {
    paddingHorizontal: spacing.xs,
    paddingTop: 0,
    marginTop: -spacing.xs,
  },
});
