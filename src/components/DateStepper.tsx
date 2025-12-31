import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChevronButton } from './ButtonIcons';
import { useTheme } from '../stores/settingsStore';
import { typographyThemed } from '../styles/typography';
import { spacing, iconSizes } from '../styles/global';
import { formatDateLabel } from '../utils/date';

interface DateStepperProps {
  date: number;
  onDateChange: (newDate: number) => void;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function DateStepper({ date, onDateChange }: DateStepperProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ChevronButton
        direction="left"
        size={iconSizes.medium}
        color={theme.colors.textSecondary}
        pressedColor={theme.colors.textPrimary}
        onPress={() => onDateChange(date - ONE_DAY_MS)}
      />
      <Text style={typographyThemed(theme).bodyPrimary}>
        {formatDateLabel(date)}
      </Text>
      <ChevronButton
        direction="right"
        size={iconSizes.medium}
        color={theme.colors.textSecondary}
        pressedColor={theme.colors.textPrimary}
        onPress={() => onDateChange(date + ONE_DAY_MS)}
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
