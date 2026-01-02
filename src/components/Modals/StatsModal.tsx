import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { useProgressStore } from '../../stores/progressStore';
import { useStatsStore, Stats } from '../../stores/statsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';
import { modalStyles } from '../../styles/modalStyles';
import ModalWrapper from './ModalWrapper';
import JourneyProgressBar from '../JourneyProgressBar';

interface StatsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

// Format a date nicely
const formatDate = (date: Date | null): string => {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Format miles with one decimal if needed
const formatMiles = (miles: number): string => {
  if (miles === Math.floor(miles)) return miles.toString();
  return miles.toFixed(1);
};

export default function StatsModal({ visible, onDismiss }: StatsModalProps) {
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

  const renderStatRow = (
    label: string,
    value: string | number,
    isLast = false,
  ) => (
    <View
      style={[
        styles.statRow,
        isLast
          ? undefined
          : { borderBottomColor: theme.colors.divider, borderBottomWidth: 1 },
      ]}
    >
      <Text style={[typographyThemed(theme).bodyPrimary, styles.statLabel]}>
        {label}
      </Text>
      <Text style={[typographyThemed(theme).bodyPrimary, styles.statValue]}>
        {value}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyStateMessage}>
      <Text
        style={[typographyThemed(theme).bodyPrimary, styles.emptyStateText]}
      >
        Make more progress to unlock stats
      </Text>
    </View>
  );

  const renderStats = (statsData: Stats) => (
    <>
      {/* Journey Progress Section */}
      <View style={modalStyles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            modalStyles.sectionTitle,
          ]}
        >
          Journey progress
        </Text>
        {renderStatRow(
          'Checkpoints completed',
          `${statsData.journey.checkpointsCompleted} / ${statsData.journey.checkpointsTotal}`,
        )}
        {renderStatRow(
          'Miles completed',
          `${formatMiles(statsData.journey.milesCompleted)} / ${
            statsData.journey.milesTotalJourney
          }`,
        )}
        {renderStatRow(
          'Miles remaining',
          formatMiles(statsData.journey.milesRemaining),
          !statsData.journey.nextCheckpointName,
        )}
        {statsData.journey.nextCheckpointName &&
          renderStatRow(
            'Next checkpoint',
            `${statsData.journey.nextCheckpointName} (${formatMiles(
              statsData.journey.milesUntilNextCheckpoint,
            )} mi)`,
            true,
          )}
      </View>

      {/* Activity Section */}
      <View style={modalStyles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            modalStyles.sectionTitle,
          ]}
        >
          Activity
        </Text>
        {renderStatRow(
          'Date started',
          formatDate(statsData.activity.dateStarted),
        )}
        {renderStatRow('Active days', statsData.activity.totalActiveDays)}
        {renderStatRow(
          'Best day',
          statsData.activity.bestDayMiles > 0
            ? `${formatMiles(statsData.activity.bestDayMiles)} mi (${formatDate(
                statsData.activity.bestDayDate,
              )})`
            : '—',
        )}
        {renderStatRow(
          'Current streak',
          `${statsData.activity.currentStreak} days`,
        )}
        {renderStatRow(
          'Longest streak',
          `${statsData.activity.longestStreak} days`,
        )}
        {renderStatRow(
          'Miles this week',
          formatMiles(statsData.activity.milesThisWeek),
        )}
        {renderStatRow(
          'Miles this month',
          formatMiles(statsData.activity.milesThisMonth),
          true,
        )}
      </View>

      {/* Pace & Projections Section */}
      <View style={modalStyles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            modalStyles.sectionTitle,
          ]}
        >
          Pace & projections
        </Text>
        {renderStatRow(
          'Avg miles/day',
          formatMiles(statsData.pace.averageMilesPerDay),
        )}
        {renderStatRow(
          'Avg miles/active day',
          formatMiles(statsData.pace.averageMilesPerActiveDay),
          !statsData.pace.estimatedDaysRemaining &&
            !statsData.pace.estimatedCompletionDate,
        )}
        {statsData.pace.estimatedDaysRemaining > 0 &&
          renderStatRow(
            'Est. days remaining',
            statsData.pace.estimatedDaysRemaining,
            !statsData.pace.estimatedCompletionDate,
          )}
        {statsData.pace.estimatedCompletionDate &&
          renderStatRow(
            'Est. completion',
            formatDate(statsData.pace.estimatedCompletionDate),
            true,
          )}
      </View>
    </>
  );

  return (
    <ModalWrapper
      visible={visible}
      onDismiss={onDismiss}
      title="Stats"
      smallHeader
    >
      <ScrollView
        style={modalStyles.scrollView}
        contentContainerStyle={[
          modalStyles.scrollContent,
          !stats && styles.emptyStateContainer,
        ]}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {stats ? renderStats(stats) : renderEmptyState()}

        {/* Journey Progress Bar at bottom */}
        <View style={styles.progressBarSection}>
          <JourneyProgressBar isLocked={false} />
        </View>
      </ScrollView>
    </ModalWrapper>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statLabel: {
    flex: 1,
  },
  statValue: {
    fontWeight: '600',
    textAlign: 'right',
  },
  emptyStateContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  emptyStateMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    textAlign: 'center',
  },
  progressBarSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
});
