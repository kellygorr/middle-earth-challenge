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
import { useInitializationStore } from '../stores/initializationStore';
import {
  orderTroubleshootingIssues,
  troubleshootingIssueSlot,
} from '../constants/troubleshootingIssues';
import { typographyThemed } from '../styles/typography';
import { useUIStore } from '../stores/uiStore';
import { spacing, borderRadius, iconSizes } from '../styles/global';
import { formatReleaseNotes } from '../constants/releaseNotes';
import appInfo from '../../package.json';
import { SyncNowRow, useCanSyncNow } from './SyncNowRow';
import Button from './Buttons/Button';
import IconButton from './Buttons/IconButton';
import { StatusBadge } from './StatusBadge';
import { PlusIcon } from '../assets/icons';
import InlineIconLink from './InlineIconLink';
import CirclePlusIcon from './CirclePlusIcon';
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
  /**
   * Short category label for the badge chip next to the headline (e.g.
   * "Permission", "Sync issue", "Completed") — lets a user scanning
   * multiple cards tell at a glance what kind of thing each one is,
   * rather than every card saying the same generic "Issue".
   */
  badgeLabel: string;
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
          badgeLabel: 'Permission',
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
          headline: 'Tracking stopped',
          badgeLabel: 'Permission',
          body:
            'Access to both Pedometer and Health Connect was removed. ' +
            'Choose a source in Sync settings to resume tracking.',
          showAddHint: true,
        };
      }
      return {
        headline: 'Disconnected from health data',
        badgeLabel: 'Permission',
        body:
          'Your health app permission was turned off. ' +
          'Reconnect below to sync automatically.',
        showAddHint: true,
      };
    case 'sourceFallback':
      if (error.unavailableSource === 'pedometer') {
        return {
          headline: 'Switched to Health Connect',
          badgeLabel: 'Info',
          body:
            'Pedometer permission was removed, so Health Connect is now ' +
            'your tracking source.',
          showAddHint: false,
        };
      }
      return {
        headline: 'Switched to Pedometer',
        badgeLabel: 'Info',
        body:
          'Health Connect access was removed, so Pedometer is now your ' +
          'tracking source.',
        showAddHint: false,
      };
    case 'timeout':
      return {
        headline: 'Sync took too long',
        badgeLabel: 'Sync',
        body:
          'Your health app took too long to return one of the date ranges we asked for. ' +
          'You haven’t lost any newly synced data, and we’ll pick up where the syncing left off.',
        showAddHint: false,
      };
    case 'unavailable':
      return {
        headline: 'Can’t connect to health app',
        badgeLabel: 'Sync',
        body:
          Platform.OS === 'android'
            ? 'Health Connect is missing or out of date. Install or update it from the Play Store to sync your activity.'
            : 'Your health app isn’t available right now. We’ll keep trying.',
        showAddHint: false,
      };
    case 'provider':
      return {
        headline: 'Health sync failed',
        badgeLabel: 'Sync',
        body:
          'Your health app could not return a complete activity update. ' +
          'Nothing from that date range was skipped; try syncing again.',
        showAddHint: false,
      };
    case 'pedometerStorage':
      return {
        headline: 'Pedometer storage failed',
        badgeLabel: 'Sync',
        body:
          'A step sample could not be saved. Tracking is still running and ' +
          'will retry on the next sensor update.',
        showAddHint: false,
      };
    case 'pedometerServiceStopped':
      return {
        headline: 'Step counting stopped',
        badgeLabel: 'Pedometer',
        body: 'Your phone shut down step tracking, so nothing was recorded after ',
        bodyEmphasis: formatTimestamp(error.lastCommitAt),
        bodyAfterEmphasis:
          '. We were able to restart it when you opened the app.',
        ...getOemBatteryGuidance(error.manufacturer),
        showAddHint: false,
        showCatchUpHint: true,
      };
    case 'newUpgrade': {
      const releaseNotes = formatReleaseNotes(appInfo.version);
      return {
        headline: 'Upgrade',
        badgeLabel: 'Completed',
        body:
          'Your app has been upgraded successfully. Keep walking Hobbit!' +
          (releaseNotes ? `\n\n${releaseNotes}` : ''),
        showAddHint: false,
      };
    }
    case 'unknown':
      return {
        headline: 'Something went wrong',
        badgeLabel: 'Sync',
        body:
          'We ran into an unexpected problem while syncing. ' +
          'Nothing from your journey has been lost — try syncing again.',
        showAddHint: true,
      };
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
 * a health-app fault are independent), so this renders one troubleshooting
 * issue (or the synthesized `newUpgrade` info card — see SyncErrorBanner's
 * own doc comment for why that one rides through here too) and the
 * container below decides how multiple cards are laid out.
 */
export function IssueCard({
  issue,
  width,
  onDismiss,
  hideTimestamp = false,
}: {
  issue: TroubleshootingIssue;
  width: number | undefined;
  /** Omit to hide the dismiss (×) button entirely — used for the
   * always-visible upgrade-confirmation row at the bottom of the
   * Troubleshooting history screen, which isn't dismissable there. */
  onDismiss?: () => void;
  /**
   * Hide the "Today at ..." footer timestamp. Used for the always-visible
   * upgrade row in Troubleshooting history, which isn't tied to a single
   * real moment the way a dismissable issue/the home-screen upgrade toast
   * are (`issue.at` there is just whatever moment this screen happened to
   * render, not a meaningful event time) — showing a changing/misleading
   * timestamp on a permanent row would be worse than showing none.
   */
  hideTimestamp?: boolean;
}) {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const pushModal = useUIStore(state => state.pushModal);
  const canSyncNow = useCanSyncNow();

  const lastSyncError = issue.error;
  const lastSyncErrorAt = issue.at;

  const copy = getCopy(lastSyncError);
  // Safety net: if we ever end up with an error kind we have no copy for,
  // render nothing rather than showing an empty card.
  if (!copy) return null;
  const {
    headline,
    badgeLabel,
    body,
    bodyEmphasis,
    bodyAfterEmphasis,
    showAddHint,
    problem,
    solution,
    showCatchUpHint,
  } = copy;
  const unitLabel = useMiles ? 'Miles' : 'Kilometers';
  // Dark background + white text for the one-time upgrade confirmation —
  // matches the Journey progress percentage pill's own dark-mode styling
  // — instead of the default light surface/uiWarning warning-card
  // treatment used by every real sync-error kind, since this is a
  // reassuring confirmation, not a problem to address. No left border
  // accent — the category badge chip (see StatusBadge above) is now the
  // card's accent signal instead of a left border stripe.
  const darkMode = lastSyncError.kind === 'newUpgrade';
  const backgroundColor = darkMode
    ? theme.colors.modalOverlay2
    : theme.colors.errorCardBackground;
  const headlineColor = darkMode
    ? theme.colors.checkpointLabel
    : theme.colors.textPrimary;
  const dismissColor = darkMode
    ? theme.colors.checkpointLabel
    : theme.colors.textSecondary;
  const bodyColor = darkMode
    ? theme.colors.checkpointLabel
    : theme.colors.textPrimary;
  // Retry footers also depend on whether SyncNowRow can show its button.
  const hasRetryAction =
    canSyncNow &&
    (lastSyncError.kind === 'timeout' || lastSyncError.kind === 'provider');
  const hasActionRow =
    hasRetryAction ||
    (lastSyncError.kind === 'unavailable' && Platform.OS === 'android') ||
    lastSyncError.kind === 'permission' ||
    lastSyncError.kind === 'sourceFallback' ||
    lastSyncError.kind === 'pedometerServiceStopped';

  return (
    <View
      testID={`troubleshooting-issue-card-${troubleshootingIssueSlot(
        lastSyncError,
      )}`}
      style={[
        styles.card,
        width === undefined ? null : { width },
        { backgroundColor },
      ]}
    >
      <View>
        <View style={styles.topRow}>
          <StatusBadge
            label={badgeLabel}
            tone={darkMode ? 'primary' : 'accent'}
            size="small"
          />
          <Text
            style={[
              typographyThemed(theme).bodyPrimary,
              styles.headline,
              { color: headlineColor },
            ]}
          >
            {headline}
          </Text>
          {onDismiss && (
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                darkMode ? 'Dismiss upgrade message' : 'Dismiss sync error'
              }
              style={styles.dismissBtn}
            >
              <Text
                style={[
                  typographyThemed(theme).subtitleLarge,
                  { color: dismissColor },
                ]}
              >
                ×
              </Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          style={styles.cardContent}
          contentContainerStyle={styles.cardContentContainer}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <View>
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                { color: bodyColor },
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
                  <InlineIconLink
                    icon={CirclePlusIcon}
                    label="icon"
                    size={12}
                    textColor={theme.colors.textPrimary}
                    onPress={() =>
                      useUIStore.getState().pushModal({ type: 'distance' })
                    }
                    accessibilityLabel="Add catch-up miles"
                  />
                  {'.'}
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
                <InlineIconLink
                  icon={CirclePlusIcon}
                  label="icon"
                  size={12}
                  textColor={theme.colors.textPrimary}
                  onPress={() =>
                    useUIStore.getState().pushModal({ type: 'distance' })
                  }
                  accessibilityLabel="Add miles"
                />
                {'.'}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
      <View>
        {!hideTimestamp &&
          lastSyncErrorAt !== null &&
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
        {/* Per-error action row. Rendered only when this kind actually has
          a footer action — an empty wrapper View still takes up its own
          padding/border space even with no visible children, which was
          silently stealing room from the card for kinds with no footer
          (e.g. newUpgrade) instead of giving it back to the content. */}
        {hasActionRow && (
          <View testID="troubleshooting-issue-footer">
            {hasRetryAction && (
              <View style={styles.retry}>
                <SyncNowRow />
              </View>
            )}
            {lastSyncError.kind === 'unavailable' &&
              Platform.OS === 'android' && (
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
                  onPress={() => pushModal({ type: 'distance' })}
                />
              </View>
            )}
          </View>
        )}
      </View>
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
 * (WelcomeModal, Settings → Sync, Troubleshooting history).
 *
 * With a single issue this is one full-width card, unchanged. With more it
 * becomes a horizontal scroller where the next card peeks in from the right;
 * the peek is the affordance, so there is nothing small to aim at. Neither
 * host can scroll vertically, so stacking is not an option.
 *
 * Dismissed issues leave here entirely and are recoverable only from the
 * issue history in Settings.
 *
 * `isHome` additionally synthesizes one extra, non-persisted card here — a
 * one-time "Upgrade complete" confirmation — whenever initializationStore's
 * `wasJustUpgraded` is true (see that store's own doc comment). This is NOT
 * a real TroubleshootingIssue: it is never added via
 * `addTroubleshootingIssue`, never written to `troubleshootingIssues`,
 * never persisted to the database. It rides in the same carousel/card
 * component purely so it looks and behaves identically to a real issue
 * card (same shape, same scrolling-with-peek behavior when combined with a
 * real issue, same dismiss affordance) — combined into one `issues`-shaped
 * array only for rendering, right here, and nowhere else. Scoped to
 * `isHome` (passed only by WelcomeModal, the one true "home screen") so it
 * never shows up in Settings → Sync or the Troubleshooting history list,
 * which both render this same component without that prop.
 */
export default function SyncErrorBanner({
  bleed = 0,
  isHome = false,
}: {
  bleed?: number;
  isHome?: boolean;
}) {
  const troubleshootingIssues = useProgressStore(
    state => state.troubleshootingIssues,
  );
  const dismissTroubleshootingIssue = useProgressStore(
    state => state.dismissTroubleshootingIssue,
  );
  const wasJustUpgraded = useInitializationStore(
    state => state.wasJustUpgraded,
  );
  const wasJustUpgradedAt = useInitializationStore(
    state => state.wasJustUpgradedAt,
  );
  const [containerWidth, setContainerWidth] = React.useState(0);

  const issues = React.useMemo(() => {
    const realIssues = orderTroubleshootingIssues(troubleshootingIssues).filter(
      issue =>
        issue.dismissedAt === null &&
        issue.resolvedAt === null &&
        getCopy(issue.error),
    );
    if (!isHome || !wasJustUpgraded) return realIssues;
    const upgradeCard: TroubleshootingIssue = {
      error: { kind: 'newUpgrade' },
      at: wasJustUpgradedAt ?? Date.now(),
      dismissedAt: null,
      resolvedAt: null,
    };
    // Always first, ahead of real issues too — this is a deliberate
    // product choice (not severity-sorted alongside other 'info' cards
    // like sourceFallback), since confirming the upgrade itself succeeded
    // is the single most important thing to reassure the user about
    // immediately after a migration, even above an unrelated sync fault.
    return [upgradeCard, ...realIssues];
  }, [troubleshootingIssues, isHome, wasJustUpgraded, wasJustUpgradedAt]);

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  if (issues.length === 0) return null;

  const dismiss = (issue: TroubleshootingIssue) => () => {
    if (issue.error.kind === 'newUpgrade') {
      useInitializationStore.getState().setWasJustUpgraded(false);
      return;
    }
    dismissTroubleshootingIssue(troubleshootingIssueSlot(issue.error));
  };

  if (issues.length === 1) {
    return (
      <IssueCard
        issue={issues[0]}
        width={undefined}
        onDismiss={dismiss(issues[0])}
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

  const cardKey = (issue: TroubleshootingIssue) =>
    issue.error.kind === 'newUpgrade'
      ? 'newUpgrade'
      : troubleshootingIssueSlot(issue.error);

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
        {issues.map(issue => {
          const key = cardKey(issue);
          return (
            <IssueCard
              key={key}
              issue={issue}
              width={cardWidth}
              onDismiss={dismiss(issue)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pagerContent: {
    gap: spacing.md,
    // Cards stretch to match the tallest card in the row so mixed-height
    // cards (e.g. the short "Upgrade complete" info card alongside a
    // longer sync-error card) look uniform in the same scroll content,
    // rather than visibly different heights side by side.
    alignItems: 'stretch',
  },
  card: {
    flexDirection: 'column',
    alignItems: 'stretch',
    // Pins the timestamp+footer group to the bottom of the card, flush
    // with the top header+content group, so equal-height sibling cards
    // (via the row's alignItems: 'stretch') always land their timestamps
    // at the same spot regardless of how much body text each has.
    justifyContent: 'space-between',
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
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardContent: {
    marginRight: -spacing.md,
    // Caps how tall the body/problem/solution block can grow before it
    // scrolls internally — without this, a long card (problem + solution
    // + catch-up hint) can push the whole card past the bottom of the
    // modal/home screen and overlap whatever renders below it.
    maxHeight: 180,
  },
  cardContentContainer: {
    paddingRight: spacing.md,
  },
  headline: {
    flex: 1,
    fontWeight: '600',
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
