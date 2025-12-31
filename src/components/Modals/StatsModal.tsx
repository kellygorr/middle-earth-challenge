import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolateColor,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../stores/settingsStore';
import { useProgressStore } from '../../stores/progressStore';
import { useStatsStore, Stats } from '../../stores/statsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes, shadows } from '../../styles/global';
import { useAnimatedModal } from '../../hooks/useAnimatedModal';
import { motion } from '../../styles/motion';
import { CloseButton } from '../ButtonIcons';
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
  const getDateStarted = useStatsStore(state => state.getDateStarted);
  const getStats = useStatsStore(state => state.getStats);

  const stats: Stats | null = hasEnoughData
    ? getStats(distanceEntries, miles)
    : null;
  const dateStarted = getDateStarted(distanceEntries);

  const {
    internalVisible,
    animatedBackgroundStyle,
    animatedContentStyle,
    contentOpacitySV,
  } = useAnimatedModal(visible, {
    entranceDelay: motion.modal.entranceDelay,
    entranceDuration: motion.modal.entranceDuration,
    exitDuration: motion.modal.exitDuration,
    easing: motion.easing.standard,
    translateDistance: -spacing.lg,
  });

  // Sync card shadow/background with content fade
  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      contentOpacitySV.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'],
    ),
    shadowOpacity: 0.3 * contentOpacitySV.value,
    elevation: contentOpacitySV.value > 0.95 ? 8 : 0,
  }));

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
    <>
      <View style={styles.emptyStateMessage}>
        <Text
          style={[typographyThemed(theme).bodyPrimary, styles.emptyStateText]}
        >
          Make more progress to unlock stats
        </Text>
      </View>

      {/* Activity Section with just date started */}
      <View style={styles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            styles.sectionTitle,
          ]}
        >
          Activity
        </Text>
        {renderStatRow('Date started', formatDate(dateStarted), true)}
      </View>
    </>
  );

  const renderStats = (statsData: Stats) => (
    <>
      {/* Journey Progress Section */}
      <View style={styles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            styles.sectionTitle,
          ]}
        >
          Journey Progress
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
      <View style={styles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            styles.sectionTitle,
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
      <View style={styles.section}>
        <Text
          style={[
            typographyThemed(theme).subtitleLargePrimary,
            styles.sectionTitle,
          ]}
        >
          Pace & Projections
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
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.modalOverlay },
          animatedBackgroundStyle,
        ]}
      >
        <TouchableWithoutFeedback onPress={onDismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <SafeAreaView
          style={styles.safeArea}
          edges={['top', 'bottom']}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.contentWrapper, animatedContentStyle]}>
            {/* Stats Title - Outside modal */}
            <Text
              style={[
                typographyThemed(theme).titleMediumInverted,
                styles.title,
              ]}
            >
              Stats
            </Text>

            <Animated.View style={[styles.modalContainer, animatedCardStyle]}>
              <CloseButton
                style={styles.closeButton}
                size={iconSizes.medium}
                onPress={onDismiss}
              />
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
              >
                {stats ? renderStats(stats) : renderEmptyState()}

                {/* Journey Progress Bar at bottom */}
                <View style={styles.progressBarSection}>
                  <JourneyProgressBar isLocked={false} />
                </View>
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 500,
    flex: 1,
    maxHeight: '80%',
    alignItems: 'flex-start',
  },
  title: {
    marginBottom: spacing.sm,
  },
  modalContainer: {
    width: '100%',
    flex: 1,
    minHeight: 400,
    borderRadius: 16,
    ...shadows.large,
    paddingTop: 48,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
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
  emptyStateMessage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
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
