import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../stores/settingsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProgressStore } from '../../stores/progressStore';
import { useUIStore } from '../../stores/uiStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, borderRadius } from '../../styles/global';
import { formatDistance } from '../../utils/date';

interface DistanceValueProps {
  value: string;
  unitLabel: string;
  color: string;
}

function DistanceValue({ value, unitLabel, color }: DistanceValueProps) {
  const theme = useTheme();
  const themedTypography = typographyThemed(theme);
  const valueLineHeight = Number(themedTypography.titleLarge.fontSize) + 2;
  const unitLineHeight = Number(themedTypography.button.fontSize) + 2;
  const [unitWrapped, setUnitWrapped] = React.useState(false);

  return (
    <View style={[styles.valueGroup, unitWrapped && styles.valueGroupWrapped]}>
      <Text
        style={[
          themedTypography.titleLarge,
          styles.value,
          { color, lineHeight: valueLineHeight },
        ]}
      >
        {value}
      </Text>
      <Text
        onLayout={event =>
          setUnitWrapped(event.nativeEvent.layout.y >= valueLineHeight - 1)
        }
        style={[
          themedTypography.button,
          styles.suffix,
          { color, lineHeight: unitLineHeight },
        ]}
      >
        {unitLabel}
      </Text>
    </View>
  );
}

/**
 * DistanceDisplay - Shows the 2-column distance information
 * Handles all the calculations internally based on the current item
 */
export function DistanceDisplay() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const unitLabel = useMiles ? 'miles' : 'kilometers';

  // Get item from modal params - this is the source of truth
  const modalStack = useUIStore(state => state.modalStack);
  const currentModal = modalStack[modalStack.length - 1];
  const modalParams = currentModal?.params;

  const currentItem = modalParams?.item ?? null;
  const itemType = modalParams?.itemType ?? null;

  const getPointFromIndex = useProgressStore(state => state.getPointFromIndex);
  const getNextCheckpointAfterMiles = useProgressStore(
    state => state.getNextCheckpointAfterMiles,
  );
  const getRemainingMilesTo = useProgressStore(
    state => state.getRemainingMilesTo,
  );
  const isLockedCheckpoint = useProgressStore(state =>
    itemType === 'checkpoint' &&
    currentItem &&
    'CUMULATIVE_MILES' in currentItem
      ? state.isLockedCheckpoint(currentItem.CUMULATIVE_MILES || 0)
      : false,
  );

  if (!currentItem) return null;

  const isCheckpointView = itemType === 'checkpoint';
  const milesVal = currentItem.CUMULATIVE_MILES as number;
  const index = currentItem.index ?? -1;

  // For checkpoints, use index to get next checkpoint
  // For trivia (no index), find next checkpoint by miles
  let nextCheckpoint = null;
  if (isCheckpointView && index >= 0) {
    nextCheckpoint = getPointFromIndex(index + 1, 'checkpoint');
  } else if (!isCheckpointView && Number.isFinite(milesVal)) {
    // Find the next checkpoint after this trivia's miles
    nextCheckpoint = getNextCheckpointAfterMiles(milesVal);
  }

  const nextCheckpointName = nextCheckpoint?.name ?? null;
  const checkpointMiles = milesVal;

  const nextCheckpointMiles = (() => {
    const m = Number(nextCheckpoint?.CUMULATIVE_MILES ?? NaN);
    return Number.isFinite(m) ? m : null;
  })();

  const milesToNextCheckpoint =
    nextCheckpointMiles !== null
      ? Math.max(1, nextCheckpointMiles - checkpointMiles)
      : null;

  // Show left column if we have valid checkpoint miles
  const showLeftColumn =
    Number.isFinite(checkpointMiles) && checkpointMiles > 0;

  // Hide right column if no next checkpoint (final checkpoint) unless locked
  const showRightColumn = nextCheckpoint !== null || isLockedCheckpoint;

  const remaining =
    !isCheckpointView && nextCheckpointMiles !== null
      ? Math.round(getRemainingMilesTo(nextCheckpointMiles))
      : Math.round(getRemainingMilesTo(milesVal));

  const isLocked = isCheckpointView && isLockedCheckpoint;
  const pillBackground = isLocked
    ? theme.colors.infoModalInactive
    : theme.colors.checkpointTextBackground;
  const titleColor = isLocked ? theme.colors.infoModalInactive : undefined;

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={[styles.row, styles.titleRow]}>
        <View style={[styles.col, !showLeftColumn && styles.hidden]}>
          <Text
            style={[
              typographyThemed(theme).captionPrimaryBold,
              styles.title,
              titleColor ? { color: titleColor } : null,
            ]}
          >
            {isCheckpointView ? 'Checkpoint' : 'Total distance'}
          </Text>
        </View>
        <View style={[styles.col, !showRightColumn && styles.hidden]}>
          <Text
            style={[
              typographyThemed(theme).captionPrimaryBold,
              styles.title,
              titleColor ? { color: titleColor } : null,
            ]}
          >
            {isLocked ? 'Remaining' : nextCheckpointName || 'Next checkpoint'}
          </Text>
        </View>
      </View>

      {/* Value row */}
      <View style={styles.row}>
        <View style={[styles.col, !showLeftColumn && styles.hidden]}>
          <View style={[styles.pill, { backgroundColor: pillBackground }]}>
            <DistanceValue
              value={formatDistance(checkpointMiles, {
                useLargeUnit: true,
                noDecimals: true,
                useMiles,
              })}
              unitLabel={unitLabel}
              color={theme.colors.checkpointLabel}
            />
          </View>
        </View>
        <View style={[styles.col, !showRightColumn && styles.hidden]}>
          <View style={[styles.pill, { backgroundColor: pillBackground }]}>
            <DistanceValue
              value={
                isLocked
                  ? formatDistance(Math.abs(remaining), {
                      useLargeUnit: true,
                      noDecimals: true,
                      useMiles,
                    })
                  : formatDistance(milesToNextCheckpoint ?? remaining, {
                      useLargeUnit: true,
                      noDecimals: true,
                      useMiles,
                    })
              }
              unitLabel={unitLabel}
              color={theme.colors.checkpointLabel}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleRow: {
    alignItems: 'flex-end',
  },
  col: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  title: {
    marginBottom: 4,
    textAlign: 'left',
  },
  pill: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  value: {
    includeFontPadding: false,
    textAlign: 'left',
  },
  valueGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.xs,
    rowGap: 0,
  },
  valueGroupWrapped: {
    transform: [{ translateY: -2 }],
  },
  suffix: {
    fontWeight: '600',
    includeFontPadding: false,
  },
});
