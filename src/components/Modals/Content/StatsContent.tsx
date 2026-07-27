import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useProgressStore } from '../../../stores/progressStore';
import { useStatsStore, Stats } from '../../../stores/statsStore';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { spacing } from '../../../styles/global';
import { formatDate, formatDistance } from '../../../utils/date';
import { formatSteps, milesToSteps } from '../../../utils/stride';
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
  const useMiles = useSettingsStore(state => state.useMiles);
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
            { borderBottomColor: theme.colors.divider },
          ]}
        >
          <JourneyProgressBar />
        </View>
        <TwoColumnRow
          labels={[useMiles ? 'Miles' : 'Kilometers', 'Remaining']}
          values={[
            formatDistance(stats.journey.milesCompleted, {
              includeUnits: true,
              useMiles,
            }),
            formatDistance(stats.journey.milesRemaining, {
              includeUnits: true,
              useMiles,
            }),
          ]}
        />
        <TwoColumnRow
          labels={['Steps', 'Remaining']}
          values={[
            formatSteps(milesToSteps(stats.journey.milesCompleted)),
            formatSteps(milesToSteps(stats.journey.milesRemaining)),
          ]}
        />
        <StatRow
          label="Checkpoints"
          value={`${stats.journey.checkpointsCompleted} of ${stats.journey.checkpointsTotal}`}
        />
        {stats.journey.nextCheckpointName && (
          <StatRow
            label={`Next: ${stats.journey.nextCheckpointName}`}
            value={formatDistance(stats.journey.milesUntilNextCheckpoint, {
              includeUnits: true,
              useMiles,
            })}
            subValue={`${formatSteps(
              milesToSteps(stats.journey.milesUntilNextCheckpoint),
            )} steps`}
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
              ? `${formatDistance(stats.activity.bestDayMiles, {
                  includeUnits: true,
                  useMiles,
                })} (${formatDate(stats.activity.bestDayDate)})`
              : '—'
          }
          subValue={
            stats.activity.bestDayMiles > 0
              ? `${formatSteps(
                  milesToSteps(stats.activity.bestDayMiles),
                )} steps`
              : undefined
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
                  { includeUnits: true, useMiles },
                )})`
              : 'This week',
            'Last week',
          ]}
          values={[
            formatDistance(stats.activity.milesThisWeek, {
              includeUnits: true,
              useMiles,
            }),
            stats.activity.milesLastWeek > 0
              ? formatDistance(stats.activity.milesLastWeek, {
                  includeUnits: true,
                  useMiles,
                })
              : '—',
          ]}
          subValues={[
            stats.activity.milesThisWeek > 0
              ? `${formatSteps(
                  milesToSteps(stats.activity.milesThisWeek),
                )} steps`
              : undefined,
            stats.activity.milesLastWeek > 0
              ? `${formatSteps(
                  milesToSteps(stats.activity.milesLastWeek),
                )} steps`
              : undefined,
          ]}
          isLast
        />
      </Section>

      <Section>
        <SectionHeader title="Pace & projections" />
        <StatRow
          label="Daily average"
          value={formatDistance(stats.pace.averageMilesPerDay, {
            includeUnits: true,
            useMiles,
          })}
          subValue={`${formatSteps(
            milesToSteps(stats.pace.averageMilesPerDay),
          )} steps`}
        />
        <StatRow
          label={`Daily average\n(excluding missed days)`}
          value={formatDistance(stats.pace.averageMilesPerActiveDay, {
            includeUnits: true,
            useMiles,
          })}
          subValue={`${formatSteps(
            milesToSteps(stats.pace.averageMilesPerActiveDay),
          )} steps`}
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
    borderBottomWidth: 1,
  },
});
