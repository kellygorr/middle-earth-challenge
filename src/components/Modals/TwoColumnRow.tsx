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
  /**
   * Optional secondary values shown below the main values in a smaller/muted
   * style. Pass `undefined` for either column to suppress the subvalue on
   * that side.
   */
  subValues?: [string | undefined, string | undefined];
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

export default function TwoColumnRow({
  labels,
  values,
  subValues,
  isLast = false,
}: TwoColumnRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        !isLast && styles.rowDivider,
        !isLast && { borderBottomColor: theme.colors.divider },
      ]}
    >
      <View style={styles.column}>
        <Text style={typographyThemed(theme).captionSecondary}>
          {labels[0]}
        </Text>
        <Text style={typographyThemed(theme).bodyPrimary}>{values[0]}</Text>
        {subValues?.[0] !== undefined && (
          <Text style={typographyThemed(theme).captionSecondary}>
            {subValues[0]}
          </Text>
        )}
      </View>
      <View style={[styles.column, styles.columnRight]}>
        <Text style={typographyThemed(theme).captionSecondary}>
          {labels[1]}
        </Text>
        <Text style={typographyThemed(theme).bodyPrimary}>{values[1]}</Text>
        {subValues?.[1] !== undefined && (
          <Text style={typographyThemed(theme).captionSecondary}>
            {subValues[1]}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
  },
  column: {
    flex: 1,
  },
  columnRight: {
    alignItems: 'flex-end',
  },
});
