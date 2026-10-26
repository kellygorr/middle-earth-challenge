import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import type { TroubleshootingIssue } from '../../../stores/progressStore';
import { troubleshootingIssueSlot } from '../../../constants/troubleshootingIssues';
import { ensureTrackingModeRunning } from '../../../services/trackingModeService';
import SyncErrorBanner, { IssueCard } from '../../SyncErrorBanner';
import { typographyThemed } from '../../../styles/typography';
import { spacing, borderRadius } from '../../../styles/global';
import Button from '../../Buttons/Button';
import { getTroubleshootingIssueSummary } from '../../SyncErrorBanner';

const formatWhen = (at: number): string => {
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
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} at ${time}`;
};

/**
 * Every issue currently on record, including ones the user swiped away.
 * The banner only shows undismissed issues, so this is where a card that was
 * closed by accident can be found again.
 */
export default function TroubleshootingHistoryContent() {
  const theme = useTheme();
  const troubleshootingIssues = useProgressStore(
    state => state.troubleshootingIssues,
  );
  const restoreTroubleshootingIssue = useProgressStore(
    state => state.restoreTroubleshootingIssue,
  );
  const dismissTroubleshootingIssue = useProgressStore(
    state => state.dismissTroubleshootingIssue,
  );
  const clearAllTroubleshootingIssues = useProgressStore(
    state => state.clearAllTroubleshootingIssues,
  );
  const reopeningRef = React.useRef(false);

  // Synthesized, non-persisted card — same `newUpgrade` kind
  // SyncErrorBanner uses for its session-scoped home-screen toast, but
  // this one is independent of that: it's always shown here regardless of
  // initializationStore's `wasJustUpgraded`, has no dismiss button, and
  // `at` is never read (hideTimestamp below) since it isn't a real event
  // time. useMemo only to avoid recreating the object every render.
  const upgradeIssue: TroubleshootingIssue = React.useMemo(
    () => ({
      error: { kind: 'newUpgrade' },
      at: 0,
      dismissedAt: null,
      resolvedAt: null,
    }),
    [],
  );

  const close = (slot: ReturnType<typeof troubleshootingIssueSlot>) => {
    dismissTroubleshootingIssue(slot);
  };

  // Reopening re-runs the real permission/environment check rather than
  // assuming the issue is still live, so the row settles on Fixed or Active
  // from evidence. Without this, reopening a problem the user has since
  // solved would show it as Active again.
  const reopen = async (slot: ReturnType<typeof troubleshootingIssueSlot>) => {
    if (reopeningRef.current) return;
    reopeningRef.current = true;
    try {
      restoreTroubleshootingIssue(slot);
      await ensureTrackingModeRunning();
    } catch (error) {
      console.warn('[troubleshootingHistory] re-check failed', error);
    } finally {
      reopeningRef.current = false;
    }
  };

  if (troubleshootingIssues.length === 0) {
    return (
      <View style={styles.root}>
        <Text
          style={[
            typographyThemed(theme).body,
            styles.empty,
            { color: theme.colors.textSecondary },
          ]}
        >
          No tracking problems recorded.
        </Text>
        {/* Always-visible upgrade confirmation + release notes for the
            currently-installed version — independent of
            initializationStore's session-scoped `wasJustUpgraded` flag
            (which only drives the ephemeral home-screen toast), not a
            real TroubleshootingIssue, and deliberately excluded from
            "Clear history" since it isn't part of troubleshootingIssues
            at all. No dismiss button and no timestamp — this is a
            permanent reference, not a one-time event notice. Pinned to
            the bottom of the modal via styles.root's space-between (the
            parent ScrollView's contentContainerStyle has flexGrow: 1, so
            this View can stretch to fill the available height when
            content is short, while still scrolling normally when it
            overflows). */}
        <View style={styles.upgradeRow}>
          <IssueCard issue={upgradeIssue} width={undefined} hideTimestamp />
        </View>
      </View>
    );
  }

  const ordered = [...troubleshootingIssues].sort(
    (left, right) => right.at - left.at,
  );

  return (
    <View style={styles.root}>
      <View>
        {/* Opening a row below moves it up here, so the action has an
            effect the user can see without leaving the screen. */}
        <SyncErrorBanner bleed={spacing.lg} />

        {ordered.map(issue => {
          const slot = troubleshootingIssueSlot(issue.error);
          const summary = getTroubleshootingIssueSummary(issue.error);
          const outcome =
            issue.resolvedAt !== null
              ? 'Fixed'
              : issue.dismissedAt !== null
              ? 'Closed'
              : 'Active';
          return (
            <View
              key={`${slot}-${issue.at}`}
              style={[styles.row, { borderBottomColor: theme.colors.divider }]}
            >
              <View style={styles.rowText}>
                <Text
                  style={[
                    typographyThemed(theme).bodyPrimary,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  {summary}
                </Text>
                <Text
                  style={[
                    typographyThemed(theme).caption,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {`${outcome} · ${formatWhen(issue.at)}`}
                </Text>
              </View>
              {issue.resolvedAt === null && (
                <Button
                  variant={issue.dismissedAt === null ? 'outline' : 'brand'}
                  size="small"
                  onPress={() =>
                    issue.dismissedAt === null ? close(slot) : reopen(slot)
                  }
                >
                  {issue.dismissedAt === null ? 'Close' : 'Open'}
                </Button>
              )}
            </View>
          );
        })}

        <View style={styles.clearRow}>
          <Button
            variant="primary"
            size="small"
            onPress={clearAllTroubleshootingIssues}
          >
            Clear history
          </Button>
        </View>
      </View>

      {/* See the empty-state branch above for the full explanation of
          this permanent, non-dismissable row. */}
      <View style={styles.upgradeRow}>
        <IssueCard issue={upgradeIssue} width={undefined} hideTimestamp />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // flex: 1 lets this View stretch to fill the parent ScrollView's
  // contentContainerStyle (which has flexGrow: 1), and justifyContent:
  // 'space-between' pushes the permanent upgradeRow all the way to the
  // bottom of the modal when the rest of the content is short — while the
  // whole thing still scrolls normally if content grows past the modal's
  // height.
  root: {
    flex: 1,
    justifyContent: 'space-between',
  },
  empty: {
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.sm,
  },
  rowText: {
    flex: 1,
  },
  clearRow: {
    marginTop: spacing.md,
    alignItems: 'flex-end',
  },
  upgradeRow: {
    marginTop: spacing.lg,
  },
});
