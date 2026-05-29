import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useProgressStore } from '../../../stores/progressStore';
import { useStatsStore, Stats } from '../../../stores/statsStore';
import { useTheme } from '../../../stores/settingsStore';
import { spacing } from '../../../styles/global';
import { formatDate, formatDistance } from '../../../utils/date';
import JourneyProgressBar from '../../JourneyProgressBar';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import StatRow from '../StatRow';
import TwoColumnRow from '../TwoColumnRow';
import StatsContentInactive from './StatsContentInactive';

/**
 * StatsContent - Inner content for the Stats modal.
 * Rendered inside SharedModal's ScrollView.
 *
 * When the user has no distance entries yet, delegates to
 * `StatsContentInactive` which renders a skeleton background + a centered
 * unlock card + the live journey progress bar.
 */
export default function StatsContent() {
  const theme = useTheme();
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
    return <StatsContentInactive />;
  }

  return (
    <>
      {/* Journey Progress Section */}
      <SectionHeader title="Progress" />
      <View>
        <View
          style={[
            styles.progressRow,
            { borderBottomColor: theme.colors.divider, borderBottomWidth: 1 },
          ]}
        >
          <JourneyProgressBar />
        </View>
        <TwoColumnRow
          labels={['Miles', 'Remaining']}
          values={[
            formatDistance(stats.journey.milesCompleted, true),
            formatDistance(stats.journey.milesRemaining, true),
          ]}
        />
        <StatRow
          label="Checkpoints"
          value={`${stats.journey.checkpointsCompleted} of ${stats.journey.checkpointsTotal}`}
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
        <TwoColumnRow
          labels={[
            stats.activity.milesLastWeek > 0
              ? `This week (${
                  stats.activity.milesThisWeek - stats.activity.milesLastWeek >=
                  0
                    ? '+'
                    : ''
                }${formatDistance(
                  stats.activity.milesThisWeek - stats.activity.milesLastWeek,
                  true,
                )})`
              : 'This week',
            'Last week',
          ]}
          values={[
            formatDistance(stats.activity.milesThisWeek, true),
            stats.activity.milesLastWeek > 0
              ? formatDistance(stats.activity.milesLastWeek, true)
              : '—',
          ]}
          isLast
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
    </>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
});
