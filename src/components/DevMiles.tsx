import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../stores/settingsStore';
import { spacing, borderRadius } from '../styles/global';
import { useProgressStore } from '../stores/progressStore';

import Button from './Buttons';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';

interface DevMilesProps {
  keyboardOffset: number;
}

export default function DevMiles({ keyboardOffset }: DevMilesProps) {
  const theme = useTheme();
  const setMiles = useProgressStore(state => state.setMiles);
  const [testMiles, setTestMiles] = useState('0');

  return (
    <View
      style={[
        styles.container,
        {
          bottom: keyboardOffset,
          backgroundColor: theme.colors.modalOverlay,
        },
      ]}
    >
      <View style={styles.leftGroup}>
        <Text style={[styles.label, { color: theme.colors.textInverted }]}>
          Test Miles
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.textPrimary,
            },
          ]}
          value={testMiles}
          onChangeText={t => {
            setTestMiles(t);
          }}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={[styles.label, { color: theme.colors.textInverted }]}>
          / {TOTAL_JOURNEY_MILES}
        </Text>
      </View>
      <Button
        onPress={() => {
          const parsed = parseFloat(testMiles);
          setMiles(isNaN(parsed) ? 0 : parsed);
        }}
        variant="primary"
        size="default"
        isMediumText={false}
      >
        Walk
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { fontSize: 14, marginHorizontal: spacing.sm },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    minWidth: 80,
    fontSize: 16,
    textAlign: 'center',
  },
});
