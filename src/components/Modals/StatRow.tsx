/**
 * StatRow - Label-value pair for stats display.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface StatRowProps {
  /** Label text on the left */
  label: string;
  /** Value text on the right */
  value: string | number;
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

export default function StatRow({
  label,
  value,
  isLast = false,
}: StatRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomColor: theme.colors.divider,
          borderBottomWidth: 1,
        },
      ]}
    >
      <Text style={[typographyThemed(theme).bodyPrimary, styles.label]}>
        {label}
      </Text>
      <Text style={[typographyThemed(theme).bodyPrimary, styles.value]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  label: {
    flex: 1,
  },
  value: {
    textAlign: 'right',
  },
});
