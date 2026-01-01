import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { fitnessService } from '../services/fitnessService';
import { database } from '../services/database';
import { DistanceEntry } from '../types';

const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const SYNC_MESSAGE_DURATION_MS = 5000; // Show message for 5 seconds
const METERS_TO_MILES = 0.000621371;

/**
 * Hook that manages periodic syncing from health services while the app is in the foreground.
 * Syncs every 3 minutes when sync is enabled and the app is active.
 * Stores individual Health Connect records as distance entries.
 */
export function useSyncInterval() {
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const syncStartDate = useSettingsStore(state => state.syncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const setMiles = useProgressStore(state => state.setMiles);
  const setIsSyncing = useProgressStore(state => state.setIsSyncing);
  const setSyncMessage = useProgressStore(state => state.setSyncMessage);
  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const updateDistanceEntry = useProgressStore(
    state => state.updateDistanceEntry,
  );
  const distanceEntries = useProgressStore(state => state.distanceEntries);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Perform the actual sync
  const performSync = useCallback(async () => {
    if (
      !syncEnabled ||
      !liveSyncEnabled ||
      syncProvider === 'none' ||
      !syncStartDate
    ) {
      return;
    }

    try {
      setIsSyncing(true);

      // Initialize fitness service if needed
      await fitnessService.initialize(syncProvider);

      // Determine the start date for fetching records:
      // - First sync: use syncStartDate (when user enabled sync)
      // - Subsequent syncs: use lastSyncTimestamp (only fetch new records)
      const currentLastSync = useSettingsStore.getState().lastSyncTimestamp;
      const fetchFromDate = currentLastSync
        ? new Date(currentLastSync)
        : new Date(syncStartDate);

      const records = await fitnessService.getDistanceRecordsSince(
        fetchFromDate,
      );

      if (records.length === 0) {
        // No new records, just update timestamp
        setLastSyncTimestamp(Date.now());
        setIsSyncing(false);
        return;
      }

      // Build a map of existing Health Connect entries by ID for quick lookup
      const existingEntriesMap = new Map(
        distanceEntries
          .filter(e => e.source === 'health-connect')
          .map(e => [e.id, e]),
      );

      // Separate records into new and updated
      const newRecords: typeof records = [];
      const updatedRecords: typeof records = [];

      for (const record of records) {
        const entryId = `hc_${record.id}`;
        const existing = existingEntriesMap.get(entryId);
        const miles = record.distanceMeters * METERS_TO_MILES;

        if (!existing) {
          newRecords.push(record);
        } else if (Math.abs(existing.miles - miles) > 0.001) {
          // Miles changed - this is an updated in-progress activity
          updatedRecords.push(record);
        }
        // else: same miles, no action needed
      }

      if (newRecords.length === 0 && updatedRecords.length === 0) {
        // No changes, just update timestamp
        setLastSyncTimestamp(Date.now());
        setIsSyncing(false);
        return;
      }

      const saveId = 'default';
      let milesChanged = 0;

      // Handle new records
      for (const record of newRecords) {
        const miles = record.distanceMeters * METERS_TO_MILES;
        const timestamp = new Date(record.startTime).getTime();

        const entry: DistanceEntry = {
          id: `hc_${record.id}`,
          saveId,
          date: timestamp,
          miles,
          source: 'health-connect',
        };

        // Add to store
        addDistanceEntry(entry);

        // Persist to database (INSERT OR REPLACE)
        try {
          await database.addDistanceEntry(entry);
        } catch (err) {
          console.warn('Failed to persist health connect entry:', err);
        }

        milesChanged += miles;
      }

      // Handle updated records (in-progress activities with changed miles)
      for (const record of updatedRecords) {
        const entryId = `hc_${record.id}`;
        const existing = existingEntriesMap.get(entryId)!;
        const newMiles = record.distanceMeters * METERS_TO_MILES;
        const milesDiff = newMiles - existing.miles;

        const updatedEntry: DistanceEntry = {
          ...existing,
          miles: newMiles,
        };

        // Update in store
        updateDistanceEntry(updatedEntry);

        // Update in database (INSERT OR REPLACE uses same ID)
        try {
          await database.addDistanceEntry(updatedEntry);
        } catch (err) {
          console.warn('Failed to update health connect entry:', err);
        }

        milesChanged += milesDiff;
      }

      // Calculate new total miles from all entries
      const currentEntries = useProgressStore.getState().distanceEntries;
      const totalMiles = currentEntries.reduce(
        (sum, e) => sum + (e?.miles ?? 0),
        0,
      );

      // Update miles snapshot
      await database.setMilesSnapshot(saveId, totalMiles);
      setMiles(totalMiles);

      // Update last sync timestamp
      setLastSyncTimestamp(Date.now());

      // Show sync message if miles changed
      if (milesChanged > 0.01) {
        // Clear any existing timeout
        if (messageTimeoutRef.current) {
          clearTimeout(messageTimeoutRef.current);
        }

        setSyncMessage('Syncing miles...');

        // Clear the message after a delay
        messageTimeoutRef.current = setTimeout(() => {
          setSyncMessage(null);
        }, SYNC_MESSAGE_DURATION_MS);
      }

      console.log(
        'Sync completed:',
        newRecords.length,
        'new,',
        updatedRecords.length,
        'updated,',
        milesChanged.toFixed(2),
        'miles changed, total:',
        totalMiles.toFixed(2),
      );
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [
    syncEnabled,
    liveSyncEnabled,
    syncProvider,
    syncStartDate,
    distanceEntries,
    addDistanceEntry,
    updateDistanceEntry,
    setMiles,
    setLastSyncTimestamp,
    setIsSyncing,
    setSyncMessage,
  ]);

  // Start/stop interval based on sync enabled state and app state
  useEffect(() => {
    const startInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      if (syncEnabled && liveSyncEnabled && appStateRef.current === 'active') {
        // Perform an immediate sync
        performSync();

        // Set up the interval
        intervalRef.current = setInterval(performSync, SYNC_INTERVAL_MS);
        console.log('Sync interval started (every 1 minute)');
      }
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log('Sync interval stopped');
      }
    };

    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const wasBackground =
        appStateRef.current.match(/inactive|background/) !== null;
      const isActive = nextAppState === 'active';

      if (wasBackground && isActive) {
        // App came to foreground
        startInterval();
      } else if (!isActive && appStateRef.current === 'active') {
        // App went to background
        stopInterval();
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    // Initial setup
    if (syncEnabled && liveSyncEnabled) {
      startInterval();
    } else {
      stopInterval();
    }

    return () => {
      subscription.remove();
      stopInterval();
    };
  }, [syncEnabled, liveSyncEnabled, performSync]);

  return { performSync };
}
