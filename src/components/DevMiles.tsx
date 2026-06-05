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
import { typographyThemed } from '../styles/typography';
import { useProgressStore } from '../stores/progressStore';
import type { SyncError } from '../stores/progressStore';

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
  //
  // We track whether *we* initiated the fake sync (vs. a real sync that
  // happens to be running) so the button only shows "Stop sync" when it
  // can actually do something. Without this, the button would falsely
  // claim to stop a real in-flight sync and clobber its status.
  const syncStatus = useProgressStore(state => state.syncStatus);
  const setSyncStatus = useProgressStore(state => state.setSyncStatus);
  const resetSyncStatus = useProgressStore(state => state.resetSyncStatus);
  const [fakeSyncActive, setFakeSyncActive] = useState(false);
  const isRealSyncing = syncStatus.phase === 'syncing' && !fakeSyncActive;
  const toggleFakeSync = () => {
    if (fakeSyncActive) {
      setFakeSyncActive(false);
      resetSyncStatus();
      return;
    }
    if (isRealSyncing) return; // don't interfere with real sync
    const now = Date.now();
    setFakeSyncActive(true);
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

  // If a real sync starts while we have a fake-sync active, drop the fake
  // flag so the real sync's status owns the UI.
  useEffect(() => {
    if (syncStatus.phase !== 'syncing' && fakeSyncActive) {
      setFakeSyncActive(false);
    }
  }, [syncStatus.phase, fakeSyncActive]);

  // Fake-error buttons: push a synthetic `phase: 'error'` straight into
  // the store so we can iterate on the badge + (forthcoming) banner UI
  // without running a real sync. The store treats this exactly like a
  // real error: it captures `lastSyncError` / `lastSyncErrorAt`, which
  // lights up the Settings badge.
  const lastSyncError = useProgressStore(state => state.lastSyncError);
  const clearLastSyncError = useProgressStore(
    state => state.clearLastSyncError,
  );
  const pushFakeError = (error: SyncError) => {
    if (fakeSyncActive) {
      setFakeSyncActive(false);
    }
    const now = Date.now();
    setSyncStatus({
      phase: 'error',
      chunksDone: 0,
      chunksTotal: 0,
      milesAdded: 0,
      startedAt: now,
      lastProgressAt: now,
      error,
    });
  };
  // Dev-panel "Clear err": wipe the persisted error AND reset syncStatus
  // back to idle. Without the resetSyncStatus, a fake error leaves the
  // status stuck on phase==='error' even though the badge is gone, which
  // confuses any selector reading syncStatus.phase.
  const clearFakeError = () => {
    clearLastSyncError();
    resetSyncStatus();
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
            if (fakeSyncActive) resetSyncStatus();
            setDevMode(false);
          }}
        />
      </View>
      <View style={[styles.row, { justifyContent: 'flex-end' }]}>
        <Button
          onPress={toggleFakeSync}
          variant={fakeSyncActive ? 'primary' : 'outline'}
          size="default"
          disabled={isRealSyncing}
        >
          {fakeSyncActive ? 'Stop fake sync' : 'Fake sync'}
        </Button>
      </View>
      <View style={[styles.row, styles.errRow]}>
        <Button
          onPress={() =>
            pushFakeError({ kind: 'unknown', message: 'forced for testing' })
          }
          variant={lastSyncError?.kind === 'unknown' ? 'brand' : 'primary'}
          size="small"
          disabled={isRealSyncing}
        >
          Err: unknown (silent)
        </Button>
        <Button
          onPress={() =>
            pushFakeError({
              kind: 'unavailable',
              message: 'forced unavailable for testing',
            })
          }
          variant={lastSyncError?.kind === 'unavailable' ? 'brand' : 'primary'}
          size="small"
          disabled={isRealSyncing}
        >
          Err: unavailable
        </Button>
        <Button
          onPress={() =>
            pushFakeError({
              kind: 'permission',
              message: 'forced permission error for testing',
            })
          }
          variant={lastSyncError?.kind === 'permission' ? 'brand' : 'primary'}
          size="small"
          disabled={isRealSyncing}
        >
          Err: permission
        </Button>
        <Button
          onPress={() =>
            pushFakeError({
              kind: 'timeout',
              chunkStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
              chunkEnd: Date.now() - 6 * 24 * 60 * 60 * 1000,
              chunksDone: 3,
              chunksTotal: 8,
            })
          }
          variant={lastSyncError?.kind === 'timeout' ? 'brand' : 'primary'}
          size="small"
          disabled={isRealSyncing}
        >
          Err: timeout
        </Button>
        <Button
          onPress={() => pushFakeError({ kind: 'backgroundDisabled' })}
          variant={
            lastSyncError?.kind === 'backgroundDisabled' ? 'brand' : 'primary'
          }
          size="small"
          disabled={isRealSyncing}
        >
          Err: bg off (iOS)
        </Button>
        <Button
          onPress={clearFakeError}
          variant="outline"
          size="default"
          disabled={
            isRealSyncing ||
            (lastSyncError === null && syncStatus.phase !== 'error')
          }
        >
          Clear err
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
              typographyThemed(theme).body,
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
          <Text
            style={[
              typographyThemed(theme).caption,
              styles.label,
              { color: theme.colors.textInverted },
            ]}
          >
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
          variant="primary"
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
  errRow: {
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  label: { marginHorizontal: spacing.sm },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    minWidth: 80,
    textAlign: 'center',
  },
});
