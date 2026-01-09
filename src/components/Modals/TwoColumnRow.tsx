/**
 * TwoColumnRow - Dual-column row with labels and values for stats display.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface TwoColumnRowProps {
  /** Labels for left and right columns */
  labels: [string, string];
  /** Values for left and right columns */
  values: [string | number, string | number];
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

export default function TwoColumnRow({
  labels,
  values,
  isLast = false,
}: TwoColumnRowProps) {
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
      <View style={styles.column}>
        <Text style={typographyThemed(theme).captionSecondary}>
          {labels[0]}
        </Text>
        <Text style={typographyThemed(theme).bodyPrimary}>{values[0]}</Text>
      </View>
      <View style={[styles.column, styles.columnRight]}>
        <Text style={typographyThemed(theme).captionSecondary}>
          {labels[1]}
        </Text>
        <Text style={typographyThemed(theme).bodyPrimary}>{values[1]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  column: {
    flex: 1,
  },
  columnRight: {
    alignItems: 'flex-end',
  },
});
