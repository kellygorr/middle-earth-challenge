import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { FRIEND_PROGRESS_SYNC_INTERVAL_MS } from '../constants/sync';
import { friendProgressWorkflow } from '../services/friendProgressWorkflow';
import { useFriendProgressStore } from '../stores/friendProgressStore';
import { useInitializationStore } from '../stores/initializationStore';
import { useProgressStore } from '../stores/progressStore';
import { useSettingsStore } from '../stores/settingsStore';

export function useFriendProgressSync() {
  const initReady = useInitializationStore(state => state.phase !== 'loading');
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const provisioningPending = useSettingsStore(
    state => state.sharingProvisioningPending,
  );
  const deletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const migrationSourceUserId = useSettingsStore(
    state => state.sharingMigrationSourceUserId,
  );
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const performSync = useCallback(async () => {
    const settings = useSettingsStore.getState();
    if (
      !initReady ||
      (!settings.sharingEnabled &&
        !settings.sharingProvisioningPending &&
        !settings.sharingDeletionPending &&
        !settings.sharingMigrationSourceUserId)
    ) {
      return;
    }

    try {
      await friendProgressWorkflow.synchronize(
        useProgressStore.getState().getTotalMiles(),
        useFriendProgressStore.getState().fetchParticipants,
      );
    } catch (error) {
      console.warn('[FriendProgress] sync failed:', error);
    }
  }, [initReady]);

  useEffect(() => {
    if (!initReady) return;
    if (
      !sharingEnabled &&
      !provisioningPending &&
      !deletionPending &&
      !migrationSourceUserId
    ) {
      useFriendProgressStore.getState().clearParticipants();
      return;
    }

    performSync();
    const interval = setInterval(() => {
      if (appStateRef.current === 'active') performSync();
    }, FRIEND_PROGRESS_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    initReady,
    sharingEnabled,
    provisioningPending,
    deletionPending,
    migrationSourceUserId,
    performSync,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const wasBackgrounded = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      if (nextState === 'active' && wasBackgrounded) performSync();
    });

    return () => subscription.remove();
  }, [performSync]);
}
