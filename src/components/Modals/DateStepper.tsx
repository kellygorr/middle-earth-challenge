import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconButton } from '../Buttons';
import { ChevronIcon } from '../../assets/icons';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing, iconSizes } from '../../styles/global';
import { formatDateLabel } from '../../utils/date';

interface DateStepperProps {
  date: number;
  onDateChange: (newDate: number) => void;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function DateStepper({ date, onDateChange }: DateStepperProps) {
  const theme = useTheme();

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
        onPress={() => onDateChange(date + ONE_DAY_MS)}
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
    gap: spacing.md,
  },
});
