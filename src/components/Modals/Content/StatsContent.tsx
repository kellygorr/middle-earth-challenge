import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useProgressStore } from '../../../stores/progressStore';
import { useStatsStore, Stats } from '../../../stores/statsStore';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { spacing } from '../../../styles/global';
import { formatDate, formatDistance, milesToKm } from '../../../utils/date';
import { formatSteps, milesToSteps } from '../../../utils/stride';
import JourneyProgressBar from '../../JourneyProgressBar';
import SectionHeader from '../SectionHeader';
import Section from '../Section';
import StatRow from '../StatRow';
import TwoColumnRow from '../TwoColumnRow';
import StatsContentInactive from './StatsContentInactive';
import { database, type DistanceDaySummary } from '../../../services/database';
import { DEFAULT_SAVE_ID } from '../../../constants/gameConstants';

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
  const realMiles = useProgressStore(state => state.miles);
  const realSteps = useProgressStore(state => state.steps);
  const committedEntries = useProgressStore(state => state.distanceEntries);
  const testOverrideMiles = useProgressStore(state => state.testOverrideMiles);
  const miles = testOverrideMiles ?? realMiles;
  const steps =
    testOverrideMiles === null ? realSteps : milesToSteps(testOverrideMiles);
  const [daySummaries, setDaySummaries] = useState<DistanceDaySummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    database
      .getDistanceDaySummaries(DEFAULT_SAVE_ID)
      .then(summaries => {
        if (!cancelled) setDaySummaries(summaries);
      })
      .catch(error => console.error('Failed to load progress stats:', error));
    return () => {
      cancelled = true;
    };
  }, [committedEntries, realMiles, realSteps]);
  const hasEnoughData = useStatsStore(state => state.hasEnoughDataForStats)(
    daySummaries,
  );
  const getStats = useStatsStore(state => state.getStats);

  const stats: Stats | null = hasEnoughData
    ? getStats(daySummaries, miles, steps)
    : null;

  if (!stats) {
    return <StatsContentInactive />;
  }

  // Threshold (in the currently displayed unit — miles or km) above which
  // "excluding missed days" is different enough from the plain daily
  // average to be worth its own row. See the comment above its StatRow
  // for why a plain !== check on the two values isn't sufficient.
  const ACTIVE_DAY_AVERAGE_DIFF_THRESHOLD = 1;
  const displayedAveragePerDay = useMiles
    ? stats.pace.averageMilesPerDay
    : milesToKm(stats.pace.averageMilesPerDay);
  const displayedAveragePerActiveDay = useMiles
    ? stats.pace.averageMilesPerActiveDay
    : milesToKm(stats.pace.averageMilesPerActiveDay);
  const showActiveDayAverage =
    Math.abs(displayedAveragePerDay - displayedAveragePerActiveDay) >
    ACTIVE_DAY_AVERAGE_DIFF_THRESHOLD;

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
            formatSteps(stats.journey.stepsCompleted),
            formatSteps(milesToSteps(stats.journey.milesRemaining)),
          ]}
        />
        <StatRow
          label="Checkpoints"
          value={`${stats.journey.checkpointsCompleted} of ${stats.journey.checkpointsTotal}`}
        />
        {stats.journey.nextCheckpointName && (
          <StatRow
            label="Next"
            subLabel={stats.journey.nextCheckpointName}
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
              ? formatDate(stats.activity.bestDayDate)
              : '—'
          }
          subValue={
            stats.activity.bestDayMiles > 0
              ? `${formatDistance(stats.activity.bestDayMiles, {
                  includeUnits: true,
                  useMiles,
                })} · ${formatSteps(stats.activity.bestDaySteps)} steps`
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
              ? `${formatSteps(stats.activity.stepsThisWeek)} steps`
              : undefined,
            stats.activity.milesLastWeek > 0
              ? `${formatSteps(stats.activity.stepsLastWeek)} steps`
              : undefined,
          ]}
          isLast
        />
      </Section>

      <Section>
        <SectionHeader title="Pace & projections" />
        {/* "Excluding missed days" is only worth showing as a second row
            when it's meaningfully different from the plain daily average
            — i.e. actually says something new. Comparing the two averageMilesPerDay/averageMilesPerActiveDay
            values with strict equality wasn't enough: both are already
            rounded to 1 decimal in the store, so two genuinely different
            underlying values (e.g. totalDays vs totalActiveDays differing
            by just one day) can round to the SAME displayed number while
            still failing a strict !== check on the pre-rounded floats —
            showing a redundant second row that visually repeats the
            first. Requiring a >1 unit gap (in whichever unit — miles or
            km — is actually displayed, since a 1-mile gap and a 1-km gap
            aren't the same threshold in the underlying miles value)
            guarantees the second row only appears when it reflects a
            real, visible difference. */}
        <StatRow
          label="Daily average"
          value={formatDistance(stats.pace.averageMilesPerDay, {
            includeUnits: true,
            useMiles,
          })}
          subValue={`${formatSteps(stats.pace.averageStepsPerDay)} steps`}
          isLast={
            !showActiveDayAverage &&
            !stats.pace.estimatedDaysRemaining &&
            !stats.pace.estimatedCompletionDate
          }
        />
        {showActiveDayAverage && (
          <StatRow
            label={`Daily average\n(excluding missed days)`}
            value={formatDistance(stats.pace.averageMilesPerActiveDay, {
              includeUnits: true,
              useMiles,
            })}
            subValue={`${formatSteps(
              stats.pace.averageStepsPerActiveDay,
            )} steps`}
            isLast={
              !stats.pace.estimatedDaysRemaining &&
              !stats.pace.estimatedCompletionDate
            }
          />
        )}
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
