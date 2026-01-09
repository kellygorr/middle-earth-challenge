import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { typography, typographyThemed } from '../styles/typography';
import { spacing, borderRadius } from '../styles/global';
import checkpoints from '../constants/checkpoints.json';
import { useProgressStore } from '../stores/progressStore';

interface JourneyProgressBarProps {
  isLocked: boolean;
  darkMode?: boolean;
}

export default function JourneyProgressBar({
  isLocked,
  darkMode = false,
}: JourneyProgressBarProps) {
  const theme = useTheme();
  const progressPercentage = useProgressStore(
    state => state.getProgressPercentage,
  )();

  const [barWidth, setBarWidth] = React.useState(0);
  const fillWidth = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (barWidth <= 0) return;
    const pct = Math.max(0, Math.min(100, progressPercentage));
    const target = (pct / 100) * barWidth;
    let duration = 2000;
    if (pct < 5) duration = 500;
    else if (pct < 30) duration = 1000;
    Animated.timing(fillWidth, {
      toValue: target,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [barWidth, progressPercentage, fillWidth]);

  const firstName = (checkpoints[0] as any)?.name ?? '';
  const lastName = (checkpoints[checkpoints.length - 1] as any)?.name ?? '';

  // Text style based on darkMode
  const labelStyle = darkMode
    ? typographyThemed(theme).captionInverted
    : typographyThemed(theme).captionPrimary;

  return (
    <View style={styles.container}>
      <Text style={[labelStyle, styles.headerLabel]}>Journey progress</Text>
      <View style={styles.progressRow}>
        <View style={styles.progressLeft}>
          <View style={styles.progressLabelRow}>
            <Text style={[labelStyle, styles.progressSideLabel]}>
              {firstName}
            </Text>
            <Text style={[labelStyle, styles.progressSideLabel]}>
              {lastName}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarBackground,
                {
                  backgroundColor: darkMode
                    ? theme.colors.modalOverlay2
                    : theme.colors.pathInactive,
                },
              ]}
              onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: isLocked
                      ? theme.colors.infoModalInactive
                      : theme.colors.pathProgress,
                    width: fillWidth,
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
                  : darkMode
                  ? theme.colors.modalOverlay2
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
              {progressPercentage}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    width: '100%',
    paddingVertical: spacing.sm,
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
  headerLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.sm,
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
  progressMilesText: {
    textAlign: 'right',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  progressPercentFixed: {
    width: 56,
    marginLeft: spacing.sm,
  },
  progressPercentContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  progressPercentPillBox: {
    width: '100%',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
