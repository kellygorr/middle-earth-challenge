import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useProgressStore } from '../../../stores/progressStore';
import { useStatsStore, Stats } from '../../../stores/statsStore';
import { spacing } from '../../../styles/global';
import { modalStyles } from '../../../styles/modalStyles';
import { formatDate, formatMiles } from '../../../utils/date';
import JourneyProgressBar from '../../JourneyProgressBar';
import SectionHeader from '../../UI/SectionHeader';
import StatRow from '../../UI/StatRow';
import EmptyState from '../../UI/EmptyState';

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
      <View style={modalStyles.section}>
        <SectionHeader title="Journey progress" />
        <StatRow
          label="Checkpoints completed"
          value={`${stats.journey.checkpointsCompleted} / ${stats.journey.checkpointsTotal}`}
        />
        <StatRow
          label="Miles completed"
          value={`${formatMiles(stats.journey.milesCompleted)} / ${
            stats.journey.milesTotalJourney
          }`}
        />
        <StatRow
          label="Miles remaining"
          value={formatMiles(stats.journey.milesRemaining)}
          isLast={!stats.journey.nextCheckpointName}
        />
        {stats.journey.nextCheckpointName && (
          <StatRow
            label="Next checkpoint"
            value={`${stats.journey.nextCheckpointName} (${formatMiles(
              stats.journey.milesUntilNextCheckpoint,
            )} mi)`}
            isLast
          />
        )}
      </View>

      {/* Activity Section */}
      <View style={modalStyles.section}>
        <SectionHeader title="Activity" />
        <StatRow
          label="Date started"
          value={formatDate(stats.activity.dateStarted)}
        />
        <StatRow label="Active days" value={stats.activity.totalActiveDays} />
        <StatRow
          label="Best day"
          value={
            stats.activity.bestDayMiles > 0
              ? `${formatMiles(stats.activity.bestDayMiles)} mi (${formatDate(
                  stats.activity.bestDayDate,
                )})`
              : '—'
          }
        />
        <StatRow
          label="Current streak"
          value={`${stats.activity.currentStreak} days`}
        />
        <StatRow
          label="Longest streak"
          value={`${stats.activity.longestStreak} days`}
        />
        <StatRow
          label="Miles this week"
          value={formatMiles(stats.activity.milesThisWeek)}
        />
        <StatRow
          label="Miles this month"
          value={formatMiles(stats.activity.milesThisMonth)}
          isLast
        />
      </View>

      {/* Pace & Projections Section */}
      <View style={modalStyles.section}>
        <SectionHeader title="Pace & projections" />
        <StatRow
          label="Avg miles/day"
          value={formatMiles(stats.pace.averageMilesPerDay)}
        />
        <StatRow
          label="Avg miles/active day"
          value={formatMiles(stats.pace.averageMilesPerActiveDay)}
          isLast={
            !stats.pace.estimatedDaysRemaining &&
            !stats.pace.estimatedCompletionDate
          }
        />
        {stats.pace.estimatedDaysRemaining > 0 && (
          <StatRow
            label="Est. days remaining"
            value={stats.pace.estimatedDaysRemaining}
            isLast={!stats.pace.estimatedCompletionDate}
          />
        )}
        {stats.pace.estimatedCompletionDate && (
          <StatRow
            label="Est. completion"
            value={formatDate(stats.pace.estimatedCompletionDate)}
            isLast
          />
        )}
      </View>

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
});
