import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import type { SyncError, TroubleshootingIssue } from '../stores/progressStore';
import {
  orderTroubleshootingIssues,
  troubleshootingIssueSlot,
  type TroubleshootingIssueSlot,
} from '../constants/troubleshootingIssues';
import { typographyThemed } from '../styles/typography';
import { useUIStore } from '../stores/uiStore';
import { spacing, borderRadius, iconSizes } from '../styles/global';
import { SyncNowRow } from './SyncNowRow';
import Button from './Buttons/Button';
import IconButton from './Buttons/IconButton';
import { PlusIcon } from '../assets/icons';
import { getOemBatteryGuidance } from '../utils/oemBattery';

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
function getCopy(error: SyncError): {
  headline: string;
  body: string;
  bodyEmphasis?: string;
  bodyAfterEmphasis?: string;
  showAddHint: boolean;
  problem?: string;
  solution?: string;
  showCatchUpHint?: boolean;
} | null {
  switch (error.kind) {
    case 'permission':
      // Copy varies by source so we can name the exact permission the
      // user needs to re-grant. Only ever set for the currently-selected
      // source, so we don't have to worry about mismatched contexts.
      if (error.source === 'pedometer') {
        return {
          headline: 'Pedometer tracking is off',
          // Deliberately unspecific: this fires for physical activity, the
          // step sensor, or battery optimisation, and Sync settings lists
          // exactly which one is missing.
          body:
            'Permissions were turned off, so we can’t count your steps. ' +
            'Turn them back on to resume.',
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
          'Your health app permission was turned off. ' +
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
    case 'pedometerServiceStopped':
      return {
        headline: 'Step counting stopped',
        body: 'Your phone shut down step tracking, so nothing was recorded after ',
        bodyEmphasis: formatTimestamp(error.lastCommitAt),
        bodyAfterEmphasis:
          '. We were able to restart it when you opened the app.',
        ...getOemBatteryGuidance(error.manufacturer),
        showAddHint: false,
        showCatchUpHint: true,
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
 * One issue card. Multiple issues can be true at once (a pedometer fault and
 * a health-app fault are independent), so this renders one troubleshooting issue
 * and the container below decides how they are laid out.
 */
function TroubleshootingIssueCard({
  issue,
  width,
  onDismiss,
}: {
  issue: TroubleshootingIssue;
  width: number | undefined;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const pushModal = useUIStore(state => state.pushModal);

  const lastSyncError = issue.error;
  const lastSyncErrorAt = issue.at;

  const copy = getCopy(lastSyncError);
  // Safety net: if we ever end up with an error kind we have no copy for,
  // render nothing rather than showing an empty card.
  if (!copy) return null;
  const {
    headline,
    body,
    bodyEmphasis,
    bodyAfterEmphasis,
    showAddHint,
    problem,
    solution,
    showCatchUpHint,
  } = copy;
  const unitLabel = useMiles ? 'Miles' : 'Kilometers';
  return (
    <View
      testID={`troubleshooting-issue-card-${troubleshootingIssueSlot(
        lastSyncError,
      )}`}
      style={[
        styles.card,
        width === undefined ? null : { width },
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: theme.colors.uiWarning,
        },
      ]}
    >
      <View style={styles.topRow}>
        <Text
          style={[
            typographyThemed(theme).captionPrimary,
            styles.headline,
            { color: theme.colors.textPrimary },
          ]}
        >
          {headline}
        </Text>
        <Pressable
          onPress={onDismiss}
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
      <ScrollView
        style={styles.cardContent}
        contentContainerStyle={styles.cardContentContainer}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <Text
          style={[
            typographyThemed(theme).captionSecondary,
            { color: theme.colors.textPrimary },
          ]}
        >
          {body}
          {bodyEmphasis && (
            <Text style={styles.bodyEmphasis}>{bodyEmphasis}</Text>
          )}
          {bodyAfterEmphasis}
        </Text>
        {problem && (
          <View style={styles.section}>
            <Text
              style={[
                typographyThemed(theme).captionPrimary,
                styles.sectionTitle,
                { color: theme.colors.textPrimary },
              ]}
            >
              Problem
            </Text>
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                { color: theme.colors.textPrimary },
              ]}
            >
              {problem}
            </Text>
          </View>
        )}
        {solution && (
          <View style={styles.section}>
            <Text
              style={[
                typographyThemed(theme).captionPrimary,
                styles.sectionTitle,
                { color: theme.colors.textPrimary },
              ]}
            >
              Solution
            </Text>
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                { color: theme.colors.textPrimary },
              ]}
            >
              {solution}
            </Text>
          </View>
        )}
        {showCatchUpHint && (
          <View style={styles.section}>
            <Text
              style={[
                typographyThemed(theme).captionPrimary,
                styles.sectionTitle,
                { color: theme.colors.textPrimary },
              ]}
            >
              {`Add catch-up ${unitLabel.toLowerCase()}`}
            </Text>
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                { color: theme.colors.textPrimary },
              ]}
            >
              {
                'You can estimate what you walked while tracking was stopped and add it with the '
              }
              <View style={styles.inlinePlus}>
                <View
                  style={[
                    styles.inlinePlusCircle,
                    {
                      backgroundColor: theme.colors.buttonPrimaryBackground,
                    },
                  ]}
                >
                  <PlusIcon size={8} color={theme.colors.iconInverted} />
                </View>
              </View>
              {' button.'}
            </Text>
          </View>
        )}
        {/* Manual-entry hint: only for kinds where the automatic path is
            actually blocked (permission). Unit is dynamic so we don't
            lie to km users. */}
        {showAddHint && (
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.addHint,
              { color: theme.colors.textPrimary },
            ]}
          >
            {`${unitLabel} can also be logged with the `}
            <View style={styles.inlinePlus}>
              <View
                style={[
                  styles.inlinePlusCircle,
                  { backgroundColor: theme.colors.buttonPrimaryBackground },
                ]}
              >
                <PlusIcon size={8} color={theme.colors.iconInverted} />
              </View>
            </View>
            {' button.'}
          </Text>
        )}
        {lastSyncErrorAt !== null &&
          lastSyncError.kind !== 'permission' &&
          lastSyncError.kind !== 'pedometerServiceStopped' && (
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
      </ScrollView>
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
      {lastSyncError.kind === 'pedometerServiceStopped' && (
        <View style={styles.stalledActions}>
          <Button
            variant="primary"
            size="small"
            onPress={() => pushModal({ type: 'sync' })}
          >
            Sync settings
          </Button>
          <IconButton
            icon={<PlusIcon size={iconSizes.medium} />}
            variant="primary"
            accessibilityLabel={`Add ${unitLabel.toLowerCase()}`}
            onPress={() => pushModal({ type: 'miles' })}
          />
        </View>
      )}
    </View>
  );
}

/** Headline for an issue, for compact surfaces like the history list. */
export function getTroubleshootingIssueSummary(error: SyncError): string {
  return getCopy(error)?.headline ?? 'Tracking problem';
}

/** Visible sliver of the next card, which is what signals it is there. */
const PEEK_WIDTH = spacing.xl;

/**
 * Persistent advisory shown wherever the user can act on a sync problem
 * (WelcomeModal, Settings → Sync).
 *
 * With a single issue this is one full-width card, unchanged. With more it
 * becomes a horizontal scroller where the next card peeks in from the right;
 * the peek is the affordance, so there is nothing small to aim at. Neither
 * host can scroll vertically, so stacking is not an option.
 *
 * Dismissed issues leave here entirely and are recoverable only from the
 * issue history in Settings.
 */
export default function SyncErrorBanner({ bleed = 0 }: { bleed?: number }) {
  const troubleshootingIssues = useProgressStore(
    state => state.troubleshootingIssues,
  );
  const dismissTroubleshootingIssue = useProgressStore(
    state => state.dismissTroubleshootingIssue,
  );
  const [containerWidth, setContainerWidth] = React.useState(0);

  const issues = React.useMemo(
    () =>
      orderTroubleshootingIssues(troubleshootingIssues).filter(
        issue =>
          issue.dismissedAt === null &&
          issue.resolvedAt === null &&
          getCopy(issue.error),
      ),
    [troubleshootingIssues],
  );

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  if (issues.length === 0) return null;

  const dismiss = (slot: TroubleshootingIssueSlot) => () =>
    dismissTroubleshootingIssue(slot);

  if (issues.length === 1) {
    return (
      <TroubleshootingIssueCard
        issue={issues[0]}
        width={undefined}
        onDismiss={dismiss(troubleshootingIssueSlot(issues[0].error))}
      />
    );
  }

  // Until the first layout pass we do not know the card width, so render the
  // first issue full-width rather than flashing a mis-sized row.
  // `containerWidth` is the bled-out width (host width + 2 * bleed); a card
  // still rests aligned to the host content, so it loses one inset plus the
  // peek.
  const cardWidth =
    containerWidth > 0 ? containerWidth - bleed - PEEK_WIDTH : undefined;

  return (
    <View
      testID="troubleshooting-issue-carousel"
      onLayout={onLayout}
      style={bleed === 0 ? null : { marginHorizontal: -bleed }}
    >
      <ScrollView
        testID="troubleshooting-issue-pager"
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={
          cardWidth === undefined ? undefined : cardWidth + spacing.md
        }
        snapToAlignment="start"
        contentContainerStyle={[
          styles.pagerContent,
          { paddingHorizontal: bleed },
        ]}
      >
        {issues.map(issue => (
          <TroubleshootingIssueCard
            key={troubleshootingIssueSlot(issue.error)}
            issue={issue}
            width={cardWidth}
            onDismiss={dismiss(troubleshootingIssueSlot(issue.error))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pagerContent: {
    gap: spacing.md,
    // Cards size to their own content; stretching makes every card as tall as
    // the longest one and clips the shorter bodies.
    alignItems: 'flex-start',
  },
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
  cardContent: {
    flexGrow: 0,
    maxHeight: 180,
    marginRight: -spacing.md,
  },
  cardContentContainer: {
    paddingRight: spacing.md,
  },
  headline: {
    flex: 1,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  bodyEmphasis: {
    fontWeight: '600',
  },
  section: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  timestamp: {
    marginTop: spacing.xs,
  },
  retry: {
    marginTop: spacing.sm,
    // Buttons size to their label rather than filling the card.
    alignItems: 'flex-end',
  },
  // Fix on the left, catch-up entry on the right.
  stalledActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
