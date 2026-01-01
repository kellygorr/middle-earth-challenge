import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const setTestOverrideMiles = useProgressStore(state => state.setTestMiles);
  const isTestOverride = useProgressStore(state => state.isTestOverride);
  const [testMiles, setTestMiles] = useState('0');
  const inputRef = useRef<TextInput>(null);

  // Clear the test miles input whenever the test override is no longer active
  useEffect(() => {
    if (!isTestOverride) {
      setTestMiles('');
    }
  }, [isTestOverride]);

  return (
    <View
      style={[
        styles.container,
        {
          bottom: keyboardOffset,
          backgroundColor: theme.colors.modalOverlay,
          justifyContent: isLandscape ? 'center' : 'space-between',
        },
      ]}
    >
      <View style={[styles.leftGroup, isLandscape && styles.centeredGroup]}>
        <Text style={[styles.label, { color: theme.colors.textInverted }]}>
          Test Miles
        </Text>
        <TextInput
          ref={inputRef}
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
          setTestOverrideMiles(isNaN(parsed) ? 0 : parsed);
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
  centeredGroup: {
    marginRight: spacing.md,
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
