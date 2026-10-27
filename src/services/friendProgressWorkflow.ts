import { useSettingsStore } from '../stores/settingsStore';
import type { FriendAffinity } from '../constants/friendAffinities';
import { friendProgressService } from './friendProgressService';
import { generateShareIdentityId } from '../utils/generateId';

interface FriendProgressServiceActions {
  enableFriendProgress: (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
    shareIdentityId: string,
  ) => Promise<void>;
  updateFriendProfile: (
    displayName: string,
    affinity: FriendAffinity,
  ) => Promise<void>;
  updateFriendDistance: (distanceMiles: number) => Promise<void>;
  deleteFriendProgress: () => Promise<void>;
  deleteFriendProgressByUserId: (userId: string) => Promise<void>;
  pruneSiblingIdentities: (shareIdentityId: string) => Promise<void>;
}

type SharingSettings = Pick<
  ReturnType<typeof useSettingsStore.getState>,
  | 'sharingEnabled'
  | 'sharingDisplayName'
  | 'sharingAffinity'
  | 'sharingProvisioningPending'
  | 'sharingDeletionPending'
  | 'sharingMigrationSourceUserId'
  | 'sharingIdentityId'
  | 'lastPublishedMiles'
  | 'updateSharingSettings'
>;

interface FriendProgressWorkflowOptions {
  service?: FriendProgressServiceActions;
  getSettings?: () => SharingSettings;
  now?: () => number;
  generateIdentityId?: () => string;
}

export const createFriendProgressWorkflow = ({
  service = friendProgressService,
  getSettings = useSettingsStore.getState,
  now = Date.now,
  generateIdentityId = generateShareIdentityId,
}: FriendProgressWorkflowOptions = {}) => {
  let syncInFlight: Promise<void> | null = null;
  let deletionInFlight: Promise<void> | null = null;

  // Ensures a stable shareIdentityId exists before publishing, generating
  // one only if it's still missing (fresh opt-in, or an existing sharer
  // who enabled sharing before this field existed — both converge through
  // this same path, no separate one-off migration flow needed). Returns
  // the id so callers can both publish it and persist it in one place.
  const ensureShareIdentityId = async (
    settings: SharingSettings,
  ): Promise<string> => {
    if (settings.sharingIdentityId) return settings.sharingIdentityId;

    const shareIdentityId = generateIdentityId();
    await settings.updateSharingSettings({ sharingIdentityId: shareIdentityId });
    return shareIdentityId;
  };

  const finishProvisioning = async (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const settings = getSettings();
    const shareIdentityId = await ensureShareIdentityId(settings);
    await service.enableFriendProgress(
      displayName,
      distanceMiles,
      affinity,
      shareIdentityId,
    );
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
      let settings = getSettings();

      if (settings.sharingDeletionPending) {
        await finishDeletion();
        return;
      }
      if (settings.sharingMigrationSourceUserId) {
        // The import that set sharingMigrationSourceUserId only does so
        // when the backup's sharing was enabled, and that same import path
        // requires shareIdentityId whenever sharing is enabled (see
        // parseBackup in journeyDataTransfer.ts) — so sharingIdentityId is
        // guaranteed to be set here too. Pruning by identity (rather than
        // deleting only the single UID recorded in this one backup file)
        // catches every orphaned sibling left behind by any number of past
        // reimports of the same backup, not just the most recent install.
        if (!settings.sharingIdentityId) {
          throw new Error('Imported shared progress profile is incomplete');
        }
        await service.pruneSiblingIdentities(settings.sharingIdentityId);

        const importedProfilePending =
          !settings.sharingEnabled &&
          settings.sharingProvisioningPending &&
          settings.lastPublishedMiles === null;
        if (importedProfilePending) {
          if (!settings.sharingDisplayName || !settings.sharingAffinity) {
            throw new Error('Imported shared progress profile is incomplete');
          }
          await finishProvisioning(
            settings.sharingDisplayName,
            distanceMiles,
            settings.sharingAffinity,
          );
        }
        await getSettings().updateSharingSettings({
          sharingMigrationSourceUserId: null,
        });
        // Re-read settings: the migration branch above may have already
        // completed provisioning, and the pre-migration snapshot would
        // otherwise cause a duplicate provisioning pass below.
        settings = getSettings();
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
