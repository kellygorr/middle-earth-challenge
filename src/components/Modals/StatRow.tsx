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
  /** Optional secondary label shown below the main label in a smaller/muted style */
  subLabel?: string;
  /** Value text on the right */
  value: string | number;
  /** Optional secondary value shown below the main value in a smaller/muted style */
  subValue?: string;
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
}

export default function StatRow({
  label,
  subLabel,
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
      <View style={styles.labelColumn}>
        <Text style={[typographyThemed(theme).bodyPrimary, styles.label]}>
          {label}
        </Text>
        {subLabel !== undefined && (
          <Text
            style={[typographyThemed(theme).captionSecondary, styles.subLabel]}
          >
            {subLabel}
          </Text>
        )}
      </View>
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
    // Top-align so multi-line values (subValue) don't pull the label
    // to the vertical center of the row.
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
  },
  labelColumn: {
    flex: 1,
  },
  label: {},
  subLabel: {
    marginTop: 2,
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
