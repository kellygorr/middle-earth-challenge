import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { typography, typographyThemed } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';

interface JourneyProgressBarProps {
  leftLabel: string | undefined;
  rightLabel: string | undefined;
  progressPercentage: number;
  isLocked: boolean;
}

export default function JourneyProgressBar({
  leftLabel,
  rightLabel,
  progressPercentage,
  isLocked,
}: JourneyProgressBarProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <View style={styles.progressLeft}>
          <View style={styles.progressLabelRow}>
            <Text
              style={[
                typographyThemed(theme).captionPrimary,
                styles.progressSideLabel,
              ]}
            >
              {leftLabel}
            </Text>
            <Text
              style={[
                typographyThemed(theme).captionPrimary,
                styles.progressSideLabel,
              ]}
            >
              {rightLabel}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarBackground,
                { backgroundColor: theme.colors.pathGrey },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: isLocked
                      ? theme.colors.infoModalInactive
                      : theme.colors.pathProgress,
                    width: `${Math.max(0, Math.min(100, progressPercentage))}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>
        <View
          style={[styles.progressPercentFixed, styles.progressPercentContainer]}
        >
          <View
            style={[
              styles.progressPercentPillBox,
              {
                backgroundColor: isLocked
                  ? theme.colors.infoModalInactive
                  : theme.colors.checkpointTextBackground,
              },
            ]}
          >
            <Text
              style={[
                typography.caption,
                styles.progressPercentageText,
                { color: theme.colors.checkpointLabel },
              ]}
            >
              {Math.round(Math.max(0, Math.min(100, progressPercentage)))}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
    width: '100%',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressLeft: {
    flex: 1,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressSideLabel: {
    fontSize: 12,
    fontWeight: '500',
    maxWidth: '48%',
    textAlign: 'left',
  },
  progressBarContainer: {
    marginTop: 0,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 0,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  progressPercentageText: {
    textAlign: 'right',
    fontSize: 14,
  },
  progressPercentFixed: {
    width: 40,
    marginLeft: spacing.sm,
  },
  progressPercentContainer: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  progressPercentPillBox: {
    flex: 1,
    width: '100%',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
});
