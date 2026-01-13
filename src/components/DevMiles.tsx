import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { spacing, borderRadius, iconSizes } from '../styles/global';
import { useProgressStore } from '../stores/progressStore';

import Button, { IconButton } from './Buttons';
import { DevModeIcon } from '../assets/icons';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { formatDistance } from '../utils/date';

interface DevMilesProps {
  keyboardOffset: number;
}

export default function DevMiles({ keyboardOffset }: DevMilesProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const setTestOverrideMiles = useProgressStore(state => state.setTestMiles);
  const isTestOverride = useProgressStore(state => state.isTestOverride);
  const currentMiles = useProgressStore(state => state.miles);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);
  const [testMiles, setTestMiles] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Initialize with current miles when opening, clear when test override ends
  useEffect(() => {
    if (!isTestOverride && currentMiles !== null) {
      setTestMiles(String(Math.round(currentMiles * 100) / 100));
    }
  }, [isTestOverride, currentMiles]);

  return (
    <View
      style={[
        styles.container,
        {
          bottom: keyboardOffset || spacing.md,
          backgroundColor: theme.colors.modalOverlay,
          justifyContent: isLandscape ? 'center' : 'space-between',
        },
      ]}
    >
      <View style={[styles.leftGroup, isLandscape && styles.centeredGroup]}>
        <IconButton
          icon={<DevModeIcon size={iconSizes.medium} />}
          variant="primary"
          onPress={() => setDevMode(false)}
        />
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
          /{' '}
          {formatDistance(TOTAL_JOURNEY_MILES, {
            useLargeUnit: true,
            noDecimals: true,
            includeUnits: true,
            useMiles,
          })}
        </Text>
      </View>
      <Button
        onPress={() => {
          const parsed = parseFloat(testMiles);
          setTestOverrideMiles(isNaN(parsed) ? 0 : parsed);
        }}
        variant="brand"
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
    paddingHorizontal: spacing.md,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
