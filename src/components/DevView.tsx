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
import { useFriendProgressStore } from '../stores/friendProgressStore';

import Button, { IconButton, Dropdown } from './Buttons';
import { DevModeIcon } from '../assets/icons';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';
import { formatDistance } from '../utils/date';

interface DevViewProps {
  keyboardOffset: number;
  onLayoutHeight?: (height: number) => void;
}

export default function DevView({
  keyboardOffset,
  onLayoutHeight,
}: DevViewProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const setTestOverrideMiles = useProgressStore(state => state.setTestMiles);
  const realMiles = useProgressStore(state => state.miles);
  const testOverrideMiles = useProgressStore(state => state.testOverrideMiles);
  const currentMiles = testOverrideMiles ?? realMiles;
  const setDevMode = useSettingsStore(state => state.setDevMode);
  const useMiles = useSettingsStore(state => state.useMiles);
  const fakeParticipantsEnabled = useFriendProgressStore(
    state => state.fakeParticipantsEnabled,
  );
  const setFakeParticipantsEnabled = useFriendProgressStore(
    state => state.setFakeParticipantsEnabled,
  );
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
  // real error: it records a troubleshooting issue, which lights up the Settings badge.
  const clearAllTroubleshootingIssues = useProgressStore(
    state => state.clearAllTroubleshootingIssues,
  );
  const addTroubleshootingIssue = useProgressStore(
    state => state.addTroubleshootingIssue,
  );

  // Writes straight to the issue list rather than through setSyncStatus, so
  // the three land in different slots without the sync phase overwriting them.
  // Clear first so sticky dismissals from earlier previews cannot hide one.
  const pushThreeFakeErrors = () => {
    clearAllTroubleshootingIssues();
    addTroubleshootingIssue({
      kind: 'pedometerServiceStopped',
      lastCommitAt: Date.now() - 20 * 60 * 60 * 1000,
      staleForMs: 20 * 60 * 60 * 1000,
      manufacturer: 'samsung',
    });
    addTroubleshootingIssue({
      kind: 'sourceFallback',
      unavailableSource: 'health-app',
      activeSource: 'pedometer',
    });
    addTroubleshootingIssue({
      kind: 'provider',
      provider: 'apple-health',
      message: 'forced provider error for testing',
    });
  };
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
    clearAllTroubleshootingIssues();
    resetSyncStatus();
  };

  const [selectedErrLabel, setSelectedErrLabel] = useState<string | null>(null);

  const FAKE_ERROR_OPTIONS: Array<{ label: string; apply: () => void }> = [
    {
      label: '3 at once',
      apply: pushThreeFakeErrors,
    },
    {
      label: 'unknown (silent)',
      apply: () =>
        pushFakeError({ kind: 'unknown', message: 'forced for testing' }),
    },
    {
      label: 'unavailable',
      apply: () =>
        pushFakeError({
          kind: 'unavailable',
          message: 'forced unavailable for testing',
        }),
    },
    {
      label: 'permission (health)',
      apply: () =>
        pushFakeError({
          kind: 'permission',
          source: 'health-app',
          message: 'forced permission error for testing',
        }),
    },
    {
      label: 'permission (pedometer)',
      apply: () =>
        pushFakeError({
          kind: 'permission',
          source: 'pedometer',
          message: 'forced pedometer permission error for testing',
        }),
    },
    {
      label: 'timeout',
      apply: () =>
        pushFakeError({
          kind: 'timeout',
          chunkStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
          chunkEnd: Date.now() - 6 * 24 * 60 * 60 * 1000,
          chunksDone: 3,
          chunksTotal: 8,
        }),
    },
    {
      label: 'pedometer service stopped',
      apply: () =>
        pushFakeError({
          kind: 'pedometerServiceStopped',
          lastCommitAt: Date.now() - 20 * 60 * 60 * 1000,
          staleForMs: 20 * 60 * 60 * 1000,
          manufacturer: 'samsung',
        }),
    },
  ];

  // Initialize with current miles when opening, clear when test override ends
  useEffect(() => {
    if (testOverrideMiles === null && currentMiles !== null) {
      setTestMiles(String(Math.round(currentMiles * 100) / 100));
    }
  }, [testOverrideMiles, currentMiles]);

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
          accessibilityLabel="Exit developer mode"
          onPress={() => {
            if (fakeSyncActive) resetSyncStatus();
            setDevMode(false);
          }}
        />
      </View>
      <View style={[styles.row, styles.rowRight]}>
        {__DEV__ && (
          <Button
            onPress={() => setFakeParticipantsEnabled(!fakeParticipantsEnabled)}
            variant={fakeParticipantsEnabled ? 'brand' : 'outline'}
            size="default"
          >
            {fakeParticipantsEnabled ? 'Fake sharing on' : 'Fake sharing off'}
          </Button>
        )}
        <Button
          onPress={toggleFakeSync}
          variant={fakeSyncActive ? 'primary' : 'outline'}
          size="default"
          disabled={isRealSyncing}
        >
          {fakeSyncActive ? 'Stop fake sync' : 'Fake sync'}
        </Button>
      </View>
      {/* Fake-error buttons are strictly a developer-facing UI harness
          (they let us preview error banners without triggering real sync
          failures). __DEV__ hides them from release builds — users of the
          shipped app have no reason to inject synthetic errors. */}
      {__DEV__ && (
        <View style={[styles.row, styles.errRow]}>
          <Dropdown
            options={FAKE_ERROR_OPTIONS.map(option => ({
              value: option.label,
              label: option.label,
            }))}
            value={selectedErrLabel}
            onChange={next => {
              setSelectedErrLabel(next);
              if (next === null) {
                clearFakeError();
                return;
              }
              FAKE_ERROR_OPTIONS.find(o => o.label === next)?.apply();
            }}
            placeholder="none"
            labelPrefix="Fake error:"
            openUpward
            disabled={isRealSyncing}
          />
        </View>
      )}
      <View
        style={[
          styles.row,
          isLandscape ? styles.rowCenter : styles.rowSpaceBetween,
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
  rowRight: {
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  rowCenter: {
    justifyContent: 'center',
  },
  rowSpaceBetween: {
    justifyContent: 'space-between',
  },
  errRow: {
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    zIndex: 2,
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
