import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconButton } from '../Buttons';
import { ChevronIcon } from '../../assets/icons';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { iconSizes } from '../../styles/global';
import { formatDateLabel, getStartOfDay } from '../../utils/date';

interface DateStepperProps {
  date: number;
  onDateChange: (newDate: number) => void;
  /**
   * Latest calendar day the stepper will advance to, inclusive — defaults
   * to "today" (`Date.now()`) so a manual entry can never be dated into
   * the future. Comparison is by calendar day (via `getStartOfDay`), not
   * exact timestamp, so stepping forward from any time today still lands
   * on today rather than being blocked immediately.
   *
   * This exists because a future-dated manual entry doesn't get
   * overwritten once the real date arrives and Health Connect/pedometer
   * data syncs in for that day — automatic entries use their own
   * day-keyed IDs (`hc_aggregate_<dayStart>`, `pedo_<segmentStart>`)
   * entirely unrelated to a manual entry's `manual_<creationTime>` id, so
   * both rows persist and silently double-count that day's distance/steps
   * in every total (`SUM(miles)`/`SUM(steps)` has no per-day dedup).
   */
  maxDate?: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function DateStepper({
  date,
  onDateChange,
  maxDate = Date.now(),
}: DateStepperProps) {
  const theme = useTheme();
  // Calendar-day comparison, not exact timestamp: `date` can carry any
  // time-of-day (edited via TimeInput), and `maxDate` defaults to the
  // live "now" (including today's current time) — comparing raw
  // timestamps would incorrectly block stepping to today itself once
  // the current time of day had already passed the entry's stored time.
  const isAtMaxDay = getStartOfDay(date) >= getStartOfDay(maxDate);

  const handleNextDay = () => {
    if (isAtMaxDay) return;
    onDateChange(date + ONE_DAY_MS);
  };

  return (
    <View style={styles.container}>
      <IconButton
        icon={
          <ChevronIcon
            direction="left"
            size={iconSizes.small}
            color={theme.colors.textSecondary}
          />
        }
        pressedIcon={
          <ChevronIcon
            direction="left"
            size={iconSizes.small}
            color={theme.colors.textPrimary}
          />
        }
        onPress={() => onDateChange(date - ONE_DAY_MS)}
        accessibilityLabel="Previous day"
        size="small"
        variant="transparent"
        hitSlop={12}
      />
      <Text style={typographyThemed(theme).bodyPrimary}>
        {formatDateLabel(date)}
      </Text>
      <IconButton
        icon={
          <ChevronIcon
            direction="right"
            size={iconSizes.small}
            color={theme.colors.textSecondary}
          />
        }
        pressedIcon={
          <ChevronIcon
            direction="right"
            size={iconSizes.small}
            color={theme.colors.textPrimary}
          />
        }
        onPress={handleNextDay}
        disabled={isAtMaxDay}
        accessibilityLabel="Next day"
        size="small"
        variant="transparent"
        hitSlop={12}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
