/**
 * ToggleRow - Row with label, optional caption, and a Switch control.
 * Used for settings toggles like "Live sync".
 */

import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';

interface ToggleRowProps {
  /** Primary label text */
  label: string;
  /** Optional secondary description */
  caption?: string;
  /** Current toggle value */
  value: boolean;
  /** Change handler */
  onValueChange: (value: boolean) => void;
}

export default function ToggleRow({
  label,
  caption,
  value,
  onValueChange,
}: ToggleRowProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.textContainer}>
        <Text style={[typographyThemed(theme).captionPrimary, styles.label]}>
          {label}
        </Text>
        {caption && (
          <Text
            style={[typographyThemed(theme).captionSecondary, styles.caption]}
          >
            {caption}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.colors.switchInactive,
          true: theme.colors.buttonPrimary,
        }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    fontWeight: '600',
  },
  caption: {
    marginTop: spacing.xs,
  },
});
