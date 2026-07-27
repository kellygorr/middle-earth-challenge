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
  /** Optional secondary value shown below the main value in a smaller/muted style */
  subValue?: string;
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

export default function StatRow({
  label,
  value,
  subValue,
  isLast = false,
}: StatRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        !isLast && styles.rowDivider,
        !isLast && { borderBottomColor: theme.colors.divider },
      ]}
    >
      <Text style={[typographyThemed(theme).bodyPrimary, styles.label]}>
        {label}
      </Text>
      <View style={styles.valueColumn}>
        <Text style={[typographyThemed(theme).bodyPrimary, styles.value]}>
          {value}
        </Text>
        {subValue !== undefined && (
          <Text
            style={[typographyThemed(theme).captionSecondary, styles.subValue]}
          >
            {subValue}
          </Text>
        )}
      </View>
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
  rowDivider: {
    borderBottomWidth: 1,
  },
  label: {
    flex: 1,
  },
  valueColumn: {
    alignItems: 'flex-end',
  },
  value: {
    textAlign: 'right',
  },
  subValue: {
    textAlign: 'right',
    marginTop: 2,
  },
});
