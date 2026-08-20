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
  | 'sharingDisplayName'
  | 'sharingAffinity'
  | 'sharingProvisioningPending'
  | 'sharingDeletionPending'
  | 'lastPublishedMiles'
  | 'updateSharingSettings'
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
  let deletionInFlight: Promise<void> | null = null;

  const finishProvisioning = async (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
  ): Promise<void> => {
    await service.enableFriendProgress(displayName, distanceMiles, affinity);
    await getSettings().updateSharingSettings({
      sharingEnabled: true,
      sharingProvisioningPending: false,
      lastPublishedMiles: distanceMiles,
      lastSharedProgressSyncAt: now(),
    });
  };

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
    await settings.updateSharingSettings({
      sharingEnabled: false,
      sharingDisplayName: normalizedName,
      sharingAffinity: affinity,
      sharingProvisioningPending: true,
      sharingDeletionPending: false,
      lastPublishedMiles: distanceMiles,
      lastSharedProgressSyncAt: null,
    });
    await finishProvisioning(normalizedName, distanceMiles, affinity);
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
    if (settings.lastPublishedMiles === null) {
      throw new Error('Shared progress profile is incomplete');
    }
    await settings.updateSharingSettings({
      sharingDisplayName: normalizedName,
      sharingAffinity: affinity,
      sharingProvisioningPending: true,
    });
    await finishProvisioning(
      normalizedName,
      settings.lastPublishedMiles,
      affinity,
    );
  };

  const finishDeletion = (): Promise<void> => {
    if (deletionInFlight) return deletionInFlight;

    deletionInFlight = (async () => {
      await service.deleteFriendProgress();
      await getSettings().updateSharingSettings({
        sharingDeletionPending: false,
      });
    })().finally(() => {
      deletionInFlight = null;
    });

    return deletionInFlight;
  };

  const disableSharing = async (): Promise<void> => {
    const settings = getSettings();
    await settings.updateSharingSettings({
      sharingEnabled: false,
      sharingDisplayName: null,
      sharingAffinity: null,
      sharingProvisioningPending: false,
      sharingDeletionPending: true,
      lastPublishedMiles: null,
      lastSharedProgressSyncAt: null,
    });
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
      if (settings.sharingProvisioningPending) {
        if (!settings.sharingDisplayName || !settings.sharingAffinity) {
          throw new Error('Pending shared progress profile is incomplete');
        }
        await settings.updateSharingSettings({
          lastPublishedMiles: distanceMiles,
        });
        await finishProvisioning(
          settings.sharingDisplayName,
          distanceMiles,
          settings.sharingAffinity,
        );
      }
      if (!settings.sharingEnabled) return;

      if (settings.lastPublishedMiles !== distanceMiles) {
        if (!settings.sharingDisplayName || !settings.sharingAffinity) {
          throw new Error('Shared progress profile is incomplete');
        }
        await settings.updateSharingSettings({
          sharingProvisioningPending: true,
          lastPublishedMiles: distanceMiles,
        });
        await finishProvisioning(
          settings.sharingDisplayName,
          distanceMiles,
          settings.sharingAffinity,
        );
      }

      await fetchParticipants();
      await getSettings().updateSharingSettings({
        lastSharedProgressSyncAt: now(),
      });
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
