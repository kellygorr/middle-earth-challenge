import { useSettingsStore } from '../stores/settingsStore';
import type { FriendAffinity } from '../constants/friendAffinities';
import { friendProgressService } from './friendProgressService';

interface FriendProgressServiceActions {
  enableFriendProgress: (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
  ) => Promise<void>;
  updateFriendProfile: (
    displayName: string,
    affinity: FriendAffinity,
  ) => Promise<void>;
  updateFriendDistance: (distanceMiles: number) => Promise<void>;
  deleteFriendProgress: () => Promise<void>;
}

type SharingSettings = Pick<
  ReturnType<typeof useSettingsStore.getState>,
  | 'sharingEnabled'
  | 'sharingDeletionPending'
  | 'lastPublishedMiles'
  | 'setSharingEnabled'
  | 'setSharingDisplayName'
  | 'setSharingAffinity'
  | 'setSharingDeletionPending'
  | 'setLastPublishedMiles'
  | 'setLastSharedProgressSyncAt'
>;

interface FriendProgressWorkflowOptions {
  service?: FriendProgressServiceActions;
  getSettings?: () => SharingSettings;
  now?: () => number;
}

export const createFriendProgressWorkflow = ({
  service = friendProgressService,
  getSettings = useSettingsStore.getState,
  now = Date.now,
}: FriendProgressWorkflowOptions = {}) => {
  let syncInFlight: Promise<void> | null = null;

  const enableSharing = async (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const settings = getSettings();
    if (settings.sharingDeletionPending) {
      throw new Error('Shared data deletion is still pending');
    }

    const normalizedName = displayName.trim();
    await service.enableFriendProgress(normalizedName, distanceMiles, affinity);

    settings.setSharingDisplayName(normalizedName);
    settings.setSharingAffinity(affinity);
    settings.setLastPublishedMiles(distanceMiles);
    settings.setLastSharedProgressSyncAt(now());
    settings.setSharingDeletionPending(false);
    settings.setSharingEnabled(true);
  };

  const updateProfile = async (
    displayName: string,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const settings = getSettings();
    if (!settings.sharingEnabled || settings.sharingDeletionPending) {
      throw new Error('Shared progress is not enabled');
    }

    const normalizedName = displayName.trim();
    await service.updateFriendProfile(normalizedName, affinity);
    settings.setSharingDisplayName(normalizedName);
    settings.setSharingAffinity(affinity);
    settings.setLastSharedProgressSyncAt(now());
  };

  const finishDeletion = async (): Promise<void> => {
    const settings = getSettings();
    await service.deleteFriendProgress();
    settings.setSharingDeletionPending(false);
  };

  const disableSharing = async (): Promise<void> => {
    const settings = getSettings();
    settings.setSharingEnabled(false);
    settings.setSharingDeletionPending(true);
    settings.setSharingDisplayName(null);
    settings.setSharingAffinity(null);
    settings.setLastPublishedMiles(null);
    settings.setLastSharedProgressSyncAt(null);
    await finishDeletion();
  };

  const retryPendingDeletion = async (): Promise<void> => {
    if (!getSettings().sharingDeletionPending) {
      return;
    }
    await finishDeletion();
  };

  const synchronize = (
    distanceMiles: number,
    fetchParticipants: () => Promise<void>,
  ): Promise<void> => {
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
      const settings = getSettings();

      if (settings.sharingDeletionPending) {
        await finishDeletion();
        return;
      }
      if (!settings.sharingEnabled) return;

      if (settings.lastPublishedMiles !== distanceMiles) {
        await service.updateFriendDistance(distanceMiles);
        settings.setLastPublishedMiles(distanceMiles);
      }

      await fetchParticipants();
      settings.setLastSharedProgressSyncAt(now());
    })().finally(() => {
      syncInFlight = null;
    });

    return syncInFlight;
  };

  return {
    enableSharing,
    updateProfile,
    disableSharing,
    retryPendingDeletion,
    synchronize,
  };
};

export const friendProgressWorkflow = createFriendProgressWorkflow();
