import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useProgressStore } from '../../../stores/progressStore';
import { useStatsStore, Stats } from '../../../stores/statsStore';
import { useTheme } from '../../../stores/settingsStore';
import { spacing } from '../../../styles/global';
import { typographyThemed } from '../../../styles/typography';
import { formatDate, formatDistance } from '../../../utils/date';
import JourneyProgressBar from '../../JourneyProgressBar';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import StatRow from '../StatRow';
import EmptyState from '../EmptyState';

/**
 * WeekRow - Dual-column row showing This week and Last week side by side.
 */
function WeekRow({
  thisWeek,
  lastWeek,
}: {
  thisWeek: number;
  lastWeek: number;
}) {
  const theme = useTheme();
  const diff = thisWeek - lastWeek;
  const diffStr = `${diff >= 0 ? '+' : ''}${formatDistance(diff, true)}`;

  return (
    <View style={styles.weekRow}>
      <View style={styles.weekColumn}>
        <Text style={typographyThemed(theme).captionSecondary}>
          This week ({diffStr})
        </Text>
        <Text style={typographyThemed(theme).bodyPrimary}>
          {formatDistance(thisWeek, true)}
        </Text>
      </View>
      <View style={[styles.weekColumn, styles.weekColumnRight]}>
        <Text style={typographyThemed(theme).captionSecondary}>Last week</Text>
        <Text style={typographyThemed(theme).bodyPrimary}>
          {formatDistance(lastWeek, true)}
        </Text>
      </View>
    </View>
  );
}

/**
 * MilesRow - Dual-column row showing Miles and Remaining side by side.
 */
function MilesRow({
  completed,
  remaining,
}: {
  completed: number;
  remaining: number;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.weekRow,
        { borderBottomColor: theme.colors.divider, borderBottomWidth: 1 },
      ]}
    >
      <View style={styles.weekColumn}>
        <Text style={typographyThemed(theme).captionSecondary}>Miles</Text>
        <Text style={typographyThemed(theme).bodyPrimary}>
          {formatDistance(completed, true)}
        </Text>
      </View>
      <View style={[styles.weekColumn, styles.weekColumnRight]}>
        <Text style={typographyThemed(theme).captionSecondary}>Remaining</Text>
        <Text style={typographyThemed(theme).bodyPrimary}>
          {formatDistance(remaining, true)}
        </Text>
      </View>
    </View>
  );
}

/**
 * StatsContent - Inner content for the Stats modal.
 * Rendered inside SharedModal's ScrollView.
 */
export default function StatsContent() {
  const distanceEntries = useProgressStore(state => state.distanceEntries);
  const miles = useProgressStore(state => state.miles);
  const hasEnoughData = useStatsStore(state => state.hasEnoughDataForStats)(
    distanceEntries,
  );
  const getStats = useStatsStore(state => state.getStats);

  const stats: Stats | null = hasEnoughData
    ? getStats(distanceEntries, miles)
    : null;

  if (!stats) {
    return (
      <EmptyState message="Make more progress to unlock stats">
        <View style={styles.progressBarSection}>
          <JourneyProgressBar isLocked={false} />
        </View>
      </EmptyState>
    );
  }

  return (
    <>
      {/* Journey Progress Section */}
      <SectionHeader title="Journey progress" />
      <View>
        <StatRow
          label="Checkpoints"
          value={`${stats.journey.checkpointsCompleted} of ${stats.journey.checkpointsTotal}`}
        />
        <MilesRow
          completed={stats.journey.milesCompleted}
          remaining={stats.journey.milesRemaining}
        />
        {stats.journey.nextCheckpointName && (
          <StatRow
            label="Next checkpoint"
            value={`${stats.journey.nextCheckpointName} (${formatDistance(
              stats.journey.milesUntilNextCheckpoint,
              true,
            )})`}
            isLast
          />
        )}
      </View>

      {/* Activity Section */}
      <Section>
        <SectionHeader title="Activity" />
        <StatRow
          label="Date started"
          value={formatDate(stats.activity.dateStarted)}
        />
        <StatRow
          label="Best day"
          value={
            stats.activity.bestDayMiles > 0
              ? `${formatDistance(
                  stats.activity.bestDayMiles,
                  true,
                )} (${formatDate(stats.activity.bestDayDate)})`
              : '—'
          }
        />
        <WeekRow
          thisWeek={stats.activity.milesThisWeek}
          lastWeek={stats.activity.milesLastWeek}
        />
      </Section>

      <Section>
        <SectionHeader title="Pace & projections" />
        <StatRow
          label="Daily average"
          value={formatDistance(stats.pace.averageMilesPerDay, true)}
        />
        <StatRow
          label={`Daily average\n(excluding missed days)`}
          value={formatDistance(stats.pace.averageMilesPerActiveDay, true)}
          isLast={
            !stats.pace.estimatedDaysRemaining &&
            !stats.pace.estimatedCompletionDate
          }
        />
        {stats.pace.estimatedDaysRemaining > 0 && (
          <StatRow
            label="Estimated days remaining"
            value={stats.pace.estimatedDaysRemaining}
            isLast={!stats.pace.estimatedCompletionDate}
          />
        )}
        {stats.pace.estimatedCompletionDate && (
          <StatRow
            label="Estimated completion"
            value={formatDate(stats.pace.estimatedCompletionDate)}
            isLast
          />
        )}
      </Section>

      {/* Journey Progress Bar at bottom */}
      <View style={styles.progressBarSection}>
        <JourneyProgressBar isLocked={false} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  progressBarSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  weekRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  weekColumn: {
    flex: 1,
  },
  weekColumnRight: {
    alignItems: 'flex-end',
  },
});
