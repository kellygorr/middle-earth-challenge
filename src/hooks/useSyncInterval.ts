import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { fitnessService } from '../services/fitnessService';
import { DistanceEntry, DistanceSource } from '../types';

const SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const SYNC_MESSAGE_DURATION_MS = 5000; // Show message for 5 seconds
const INITIAL_SYNC_MIN_DURATION_MS = 3000; // Show initial sync message for at least 3 seconds
const METERS_TO_MILES = 0.000621371;

/**
 * Hook that manages periodic syncing from health services while the app is in the foreground.
 * Syncs every 3 minutes when sync is enabled and the app is active.
 * Stores individual Health Connect records as distance entries.
 */
export function useSyncInterval() {
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const setSyncEnabled = useSettingsStore(state => state.setSyncEnabled);
  const liveSyncEnabled = useSettingsStore(state => state.liveSyncEnabled);
  const syncProvider = useSettingsStore(state => state.syncProvider);
  const syncStartDate = useSettingsStore(state => state.syncStartDate);
  const setLastSyncTimestamp = useSettingsStore(
    state => state.setLastSyncTimestamp,
  );
  const setMiles = useProgressStore(state => state.setMiles);
  const setIsSyncing = useProgressStore(state => state.setIsSyncing);
  const setSyncMessage = useProgressStore(state => state.setSyncMessage);
  const setSyncError = useProgressStore(state => state.setSyncError);
  const useMiles = useSettingsStore(state => state.useMiles);
  const addDistanceEntry = useProgressStore(state => state.addDistanceEntry);
  const updateDistanceEntry = useProgressStore(
    state => state.updateDistanceEntry,
  );
  const distanceEntries = useProgressStore(state => state.distanceEntries);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialSyncRef = useRef(true); // Track if this is the first sync after app start
  const syncStartTimeRef = useRef<number | null>(null); // Track when sync started

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

      // For initial sync, show message immediately to give user confidence
      const isInitialSync = isInitialSyncRef.current;
      if (isInitialSync) {
        syncStartTimeRef.current = Date.now();
        setSyncMessage(useMiles ? 'Syncing miles...' : 'Syncing kilometers...');
        isInitialSyncRef.current = false;
      }

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

      // Determine the source based on the current platform/provider
      const healthSource: DistanceSource =
        Platform.OS === 'ios' ? 'apple-health' : 'health-connect';
      const idPrefix = Platform.OS === 'ios' ? 'ah' : 'hc';

      // Disconnect detection for iOS:
      // If we have existing apple-health entries but sync returns 0 records,
      // the user may have revoked permissions in Settings
      if (Platform.OS === 'ios' && records.length === 0) {
        const existingAppleHealthEntries = distanceEntries.filter(
          e => e.source === 'apple-health',
        );
        if (existingAppleHealthEntries.length > 0) {
          // Had entries but sync returned 0 - possible permission revocation
          // Don't immediately disable - user may just have no new data
          // The error handler below will catch actual permission errors
        }
      }

      if (records.length === 0) {
        // No new records, just update timestamp
        setLastSyncTimestamp(Date.now());
        setIsSyncing(false);

        // For initial sync, ensure message shows for minimum duration
        if (syncStartTimeRef.current) {
          const elapsed = Date.now() - syncStartTimeRef.current;
          const remaining = INITIAL_SYNC_MIN_DURATION_MS - elapsed;
          if (remaining > 0) {
            messageTimeoutRef.current = setTimeout(() => {
              setSyncMessage(null);
            }, remaining);
          } else {
            setSyncMessage(null);
          }
          syncStartTimeRef.current = null;
        }
        return;
      }

      // Build a map of existing health entries by ID for quick lookup
      const existingEntriesMap = new Map(
        distanceEntries
          .filter(e => e.source === healthSource)
          .map(e => [e.id, e]),
      );

      // Separate records into new and updated
      const newRecords: typeof records = [];
      const updatedRecords: typeof records = [];

      // Find the most recent record by startTime (only this one could be in-progress)
      const mostRecentRecordId =
        records.length > 0
          ? records.reduce((latest, r) =>
              new Date(r.startTime).getTime() >
              new Date(latest.startTime).getTime()
                ? r
                : latest,
            ).id
          : null;

      for (const record of records) {
        const entryId = `${idPrefix}_${record.id}`;
        const existing = existingEntriesMap.get(entryId);
        const miles = record.distanceMeters * METERS_TO_MILES;

        if (!existing) {
          newRecords.push(record);
        } else if (
          Math.abs(existing.miles - miles) > 0.001 &&
          record.id === mostRecentRecordId
        ) {
          // Only update the most recent record (could be in-progress activity)
          // Older records with different miles were modified by user - preserve them
          updatedRecords.push(record);
        }
        // else: same miles, or older record with user modifications - no action needed
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
          id: `${idPrefix}_${record.id}`,
          saveId,
          date: timestamp,
          miles,
          source: healthSource,
        };

        // Add to store (store handles persistence)
        await addDistanceEntry(entry);

        milesChanged += miles;
      }

      // Handle updated records (in-progress activities with changed miles)
      for (const record of updatedRecords) {
        const entryId = `${idPrefix}_${record.id}`;
        const existing = existingEntriesMap.get(entryId)!;
        const newMiles = record.distanceMeters * METERS_TO_MILES;
        const milesDiff = newMiles - existing.miles;

        const updatedEntry: DistanceEntry = {
          ...existing,
          miles: newMiles,
        };

        // Update in store (store handles persistence)
        await updateDistanceEntry(updatedEntry);

        milesChanged += milesDiff;
      }

      // Calculate new total miles from all entries
      const currentEntries = useProgressStore.getState().distanceEntries;
      const totalMiles = currentEntries.reduce(
        (sum, e) => sum + (e?.miles ?? 0),
        0,
      );

      // Update miles and persist snapshot
      setMiles(totalMiles);
      await useProgressStore.getState().persistMilesSnapshot();

      // Update last sync timestamp
      setLastSyncTimestamp(Date.now());

      // Clear any existing timeout
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }

      // Determine how long to show the message
      // - For initial sync: at least INITIAL_SYNC_MIN_DURATION_MS from start
      // - For live sync with new miles: SYNC_MESSAGE_DURATION_MS
      // - For live sync with no new miles: don't show
      if (syncStartTimeRef.current) {
        // Initial sync - ensure minimum duration
        const elapsed = Date.now() - syncStartTimeRef.current;
        const remaining = Math.max(
          INITIAL_SYNC_MIN_DURATION_MS - elapsed,
          milesChanged > 0.01 ? SYNC_MESSAGE_DURATION_MS : 0,
        );
        if (remaining > 0) {
          messageTimeoutRef.current = setTimeout(() => {
            setSyncMessage(null);
          }, remaining);
        } else {
          setSyncMessage(null);
        }
        syncStartTimeRef.current = null;
      } else if (milesChanged > 0.01) {
        // Live sync with new miles
        setSyncMessage(useMiles ? 'Syncing miles...' : 'Syncing kilometers...');

        messageTimeoutRef.current = setTimeout(() => {
          setSyncMessage(null);
        }, SYNC_MESSAGE_DURATION_MS);
      }
    } catch (error) {
      console.error('[useSyncInterval] Sync error caught:', error);

      // Clear sync message on error
      setSyncMessage(null);
      syncStartTimeRef.current = null;

      // Check if this is a permission error
      const errorMessage = String(error);
      if (
        errorMessage.includes('SecurityException') ||
        errorMessage.includes('permission')
      ) {
        // Permission error detected, disabling sync
        // Set sync error for UI to display
        setSyncError(
          `It looks like your health data connection was disconnected. If this was unintentional, you can reconnect here or in Settings. Otherwise, you can continue adding ${
            useMiles ? 'miles' : 'kilometers'
          } using the + button.`,
        );
        // Disable sync
        setSyncEnabled(false);
      }
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
    setSyncError,
    setSyncEnabled,
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
      }
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
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
      // Clear any pending message timeout and the message itself
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
      // If we're unmounting with a sync message showing, clear it
      // (the message lives in the store and persists across remounts)
      if (useProgressStore.getState().syncMessage) {
        setSyncMessage(null);
      }
    };
  }, [syncEnabled, liveSyncEnabled, performSync]);

  return { performSync };
}
