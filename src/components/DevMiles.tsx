import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useSettingsStore } from '../stores/settingsStore';
import { spacing, borderRadius, iconSizes } from '../styles/global';
import { useProgressStore } from '../stores/progressStore';

import Button, { IconButton } from './Buttons';
import { DevModeIcon } from '../assets/icons';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { formatDistance } from '../utils/date';

interface DevMilesProps {
  keyboardOffset: number;
  onLayoutHeight?: (height: number) => void;
}

export default function DevMiles({
  keyboardOffset,
  onLayoutHeight,
}: DevMilesProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const setTestOverrideMiles = useProgressStore(state => state.setTestMiles);
  const isTestOverride = useProgressStore(state => state.isTestOverride);
  const currentMiles = useProgressStore(state => state.miles);
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);
  const [testMiles, setTestMiles] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Fake-sync toggle: lets us preview the catching-up visual without
  // running a real health-data sync. Sets a synthetic mid-progress
  // syncStatus and clears it on second tap.
  const syncStatus = useProgressStore(state => state.syncStatus);
  const setSyncStatus = useProgressStore(state => state.setSyncStatus);
  const resetSyncStatus = useProgressStore(state => state.resetSyncStatus);
  const isFakeSyncing = syncStatus.phase === 'syncing';
  const toggleFakeSync = () => {
    if (isFakeSyncing) {
      resetSyncStatus();
      return;
    }
    const now = Date.now();
    setSyncStatus({
      phase: 'syncing',
      chunksDone: 2,
      chunksTotal: 8,
      milesAdded: 0,
      // Backdate startedAt a little so the ETA selector has a basis to work
      // from immediately (otherwise it returns null until the next chunk lands).
      startedAt: now - 4000,
      lastProgressAt: now,
      error: null,
    });
  };

  // Initialize with current miles when opening, clear when test override ends
  useEffect(() => {
    if (!isTestOverride && currentMiles !== null) {
      setTestMiles(String(Math.round(currentMiles * 100) / 100));
    }
  }, [isTestOverride, currentMiles]);

  return (
    <View
      onLayout={e => onLayoutHeight?.(e.nativeEvent.layout.height)}
      style={[
        styles.container,
        {
          paddingBottom:
            (keyboardOffset > 0 ? keyboardOffset : insets.bottom) + spacing.md,
          backgroundColor: theme.colors.modalOverlay,
        },
      ]}
    >
      {/* Close button floats half above the panel, top-left */}
      <View style={styles.closeButton} pointerEvents="box-none">
        <IconButton
          icon={<DevModeIcon size={iconSizes.medium} />}
          variant="primary"
          onPress={() => {
            if (isFakeSyncing) resetSyncStatus();
            setDevMode(false);
          }}
        />
      </View>
      <View style={[styles.row, { justifyContent: 'flex-end' }]}>
        <Button
          onPress={toggleFakeSync}
          variant={isFakeSyncing ? 'primary' : 'outline'}
          size="default"
        >
          {isFakeSyncing ? 'Stop sync' : 'Fake sync'}
        </Button>
      </View>
      <View
        style={[
          styles.row,
          { justifyContent: isLandscape ? 'center' : 'space-between' },
        ]}
      >
        <View style={[styles.leftGroup, isLandscape && styles.centeredGroup]}>
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
        >
          Walk
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: -iconSizes.large / 2,
    left: spacing.md,
    zIndex: 1,
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
