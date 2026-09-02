import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../stores/settingsStore';
import { useProgressStore } from '../../../stores/progressStore';
import { troubleshootingIssueSlot } from '../../../constants/troubleshootingIssues';
import { ensureTrackingModeRunning } from '../../../services/trackingModeService';
import SyncErrorBanner from '../../SyncErrorBanner';
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
      <Text
        style={[
          typographyThemed(theme).body,
          styles.empty,
          { color: theme.colors.textSecondary },
        ]}
      >
        No tracking problems recorded.
      </Text>
    );
  }

  const ordered = [...troubleshootingIssues].sort(
    (left, right) => right.at - left.at,
  );

  return (
    <View>
      {/* Opening a row below moves it up here, so the action has an effect
          the user can see without leaving the screen. */}
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
  );
}

const styles = StyleSheet.create({
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
});
