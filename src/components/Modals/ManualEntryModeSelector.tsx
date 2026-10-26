import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../stores/settingsStore';
import { borderRadius, spacing } from '../../styles/global';
import { typographyThemed } from '../../styles/typography';

export type ManualEntryMode = 'distance' | 'steps';

interface ManualEntryModeSelectorProps {
  value: ManualEntryMode;
  distanceLabel: string;
  onChange: (mode: ManualEntryMode) => void;
}

export default function ManualEntryModeSelector({
  value,
  distanceLabel,
  onChange,
}: ManualEntryModeSelectorProps) {
  const theme = useTheme();

  const renderOption = (label: string, mode: ManualEntryMode) => {
    const selected = value === mode;
    return (
      <Pressable
        key={mode}
        onPress={() => onChange(mode)}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[
          styles.segment,
          selected && {
            backgroundColor: theme.colors.buttonBrandBackground,
          },
        ]}
      >
        <Text
          style={[
            typographyThemed(theme).captionPrimary,
            styles.segmentText,
            selected ? styles.segmentTextActive : styles.segmentTextInactive,
            {
              color: selected
                ? theme.colors.buttonBrandText
                : theme.colors.textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Entry type"
      style={[
        styles.toggleRow,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.divider,
        },
      ]}
    >
      {renderOption(distanceLabel, 'distance')}
      {renderOption('Steps', 'steps')}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    padding: 2,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    minWidth: 72,
  },
  segmentText: {
    textAlign: 'center',
  },
  segmentTextActive: {
    fontWeight: '600',
  },
  segmentTextInactive: {
    fontWeight: '400',
  },
});
