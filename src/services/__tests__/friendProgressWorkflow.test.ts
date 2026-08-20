import { createFriendProgressWorkflow } from '../friendProgressWorkflow';

const createSettings = () => {
  const settings = {
    sharingEnabled: false,
    sharingDisplayName: null as string | null,
    sharingAffinity: null as 'river' | 'woodland' | 'hills' | null,
    sharingProvisioningPending: false,
    sharingDeletionPending: false,
    lastPublishedMiles: null as number | null,
    updateSharingSettings: jest.fn(),
  };
  settings.updateSharingSettings.mockImplementation(async updates => {
    Object.assign(settings, updates);
  });
  return settings;
};

const createService = () => ({
  enableFriendProgress: jest.fn().mockResolvedValue(undefined),
  updateFriendProfile: jest.fn().mockResolvedValue(undefined),
  updateFriendDistance: jest.fn().mockResolvedValue(undefined),
  deleteFriendProgress: jest.fn().mockResolvedValue(undefined),
});

describe('friendProgressWorkflow', () => {
  it('persists provisioning intent before creating the cloud row', async () => {
    const settings = createSettings();
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 1234,
    });

    await workflow.enableSharing('  Penny Greycloak  ', 12.5, 'woodland');

    expect(settings.updateSharingSettings).toHaveBeenNthCalledWith(1, {
      sharingEnabled: false,
      sharingDisplayName: 'Penny Greycloak',
      sharingAffinity: 'woodland',
      sharingProvisioningPending: true,
      sharingDeletionPending: false,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: null,
    });
    expect(service.enableFriendProgress).toHaveBeenCalledWith(
      'Penny Greycloak',
      12.5,
      'woodland',
    );
    expect(settings.updateSharingSettings).toHaveBeenNthCalledWith(2, {
      sharingEnabled: true,
      sharingProvisioningPending: false,
      lastPublishedMiles: 12.5,
      lastSharedProgressSyncAt: 1234,
    });
  });

  it('does not create the cloud row when provisioning intent cannot persist', async () => {
    const settings = createSettings();
    settings.updateSharingSettings.mockRejectedValueOnce(new Error('disk'));
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(
      workflow.enableSharing('Penny', 12.5, 'river'),
    ).rejects.toThrow('disk');
    expect(service.enableFriendProgress).not.toHaveBeenCalled();
    expect(settings.sharingEnabled).toBe(false);
    expect(settings.sharingProvisioningPending).toBe(false);
  });

  it('leaves durable provisioning intent when cloud creation fails', async () => {
    const settings = createSettings();
    const service = createService();
    service.enableFriendProgress.mockRejectedValue(new Error('offline'));
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(
      workflow.enableSharing('Penny', 12.5, 'river'),
    ).rejects.toThrow('offline');
    expect(settings).toMatchObject({
      sharingEnabled: false,
      sharingDisplayName: 'Penny',
      sharingAffinity: 'river',
      sharingProvisioningPending: true,
      lastPublishedMiles: 12.5,
    });
  });

  it('retries provisioning after cloud success but local finalization failure', async () => {
    const settings = createSettings();
    const service = createService();
    settings.updateSharingSettings
      .mockImplementationOnce(async updates => Object.assign(settings, updates))
      .mockRejectedValueOnce(new Error('disk'));
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(
      workflow.enableSharing('Penny', 12.5, 'river'),
    ).rejects.toThrow('disk');
    expect(settings.sharingProvisioningPending).toBe(true);

    settings.updateSharingSettings.mockImplementation(async updates => {
      Object.assign(settings, updates);
    });
    await workflow.synchronize(12.5, jest.fn());

    expect(service.enableFriendProgress).toHaveBeenCalledTimes(2);
    expect(settings).toMatchObject({
      sharingEnabled: true,
      sharingProvisioningPending: false,
    });
  });

  it('persists profile intent before replacing the cloud row', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
      sharingDisplayName: 'Penny Oldname',
      sharingAffinity: 'river' as const,
      lastPublishedMiles: 12.5,
    });
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 5678,
    });

    await workflow.updateProfile('  Penny Hilltop  ', 'hills');

    expect(settings.updateSharingSettings).toHaveBeenNthCalledWith(1, {
      sharingDisplayName: 'Penny Hilltop',
      sharingAffinity: 'hills',
      sharingProvisioningPending: true,
    });
    expect(service.enableFriendProgress).toHaveBeenCalledWith(
      'Penny Hilltop',
      12.5,
      'hills',
    );
    expect(settings.sharingProvisioningPending).toBe(false);
  });

  it('commits opt-out intent before deleting and then clears the marker', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
    });
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await workflow.disableSharing();

    expect(settings.updateSharingSettings).toHaveBeenNthCalledWith(1, {
      sharingEnabled: false,
      sharingDisplayName: null,
      sharingAffinity: null,
      sharingProvisioningPending: false,
      sharingDeletionPending: true,
      lastPublishedMiles: null,
      lastSharedProgressSyncAt: null,
    });
    expect(service.deleteFriendProgress).toHaveBeenCalledTimes(1);
    expect(settings.updateSharingSettings).toHaveBeenLastCalledWith({
      sharingDeletionPending: false,
    });
  });

  it('does not delete cloud data when opt-out intent cannot persist', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
    });
    settings.updateSharingSettings.mockRejectedValueOnce(new Error('disk'));
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(workflow.disableSharing()).rejects.toThrow('disk');
    expect(service.deleteFriendProgress).not.toHaveBeenCalled();
    expect(settings.sharingEnabled).toBe(true);
  });

  it('leaves deletion pending when the cloud request fails', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
    });
    const service = createService();
    service.deleteFriendProgress.mockRejectedValue(new Error('offline'));
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(workflow.disableSharing()).rejects.toThrow('offline');
    expect(settings).toMatchObject({
      sharingEnabled: false,
      sharingDeletionPending: true,
      sharingDisplayName: null,
      sharingAffinity: null,
    });
  });

  it('retries pending deletion without publishing or fetching', async () => {
    const settings = Object.assign(createSettings(), {
      sharingDeletionPending: true,
    });
    const service = createService();
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await workflow.synchronize(12.5, fetchParticipants);

    expect(service.deleteFriendProgress).toHaveBeenCalledTimes(1);
    expect(service.enableFriendProgress).not.toHaveBeenCalled();
    expect(fetchParticipants).not.toHaveBeenCalled();
    expect(settings.sharingDeletionPending).toBe(false);
  });

  it('shares deletion across the stop action and background synchronization', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
    });
    let finishDeletion: (() => void) | undefined;
    const service = createService();
    service.deleteFriendProgress.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishDeletion = resolve;
        }),
    );
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    const stopAction = workflow.disableSharing();
    await Promise.resolve();
    const backgroundSync = workflow.synchronize(12.5, jest.fn());
    await Promise.resolve();
    finishDeletion?.();
    await Promise.all([stopAction, backgroundSync]);

    expect(service.deleteFriendProgress).toHaveBeenCalledTimes(1);
    expect(settings.sharingDeletionPending).toBe(false);
  });

  it('durably publishes changed distance before fetching participants', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
      sharingDisplayName: 'Penny',
      sharingAffinity: 'river' as const,
      lastPublishedMiles: 10,
    });
    const service = createService();
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 9012,
    });

    await workflow.synchronize(12.5, fetchParticipants);

    expect(settings.updateSharingSettings).toHaveBeenNthCalledWith(1, {
      sharingProvisioningPending: true,
      lastPublishedMiles: 12.5,
    });
    expect(service.enableFriendProgress).toHaveBeenCalledWith(
      'Penny',
      12.5,
      'river',
    );
    expect(fetchParticipants).toHaveBeenCalledTimes(1);
    expect(settings.lastPublishedMiles).toBe(12.5);
    expect(settings.sharingProvisioningPending).toBe(false);
  });

  it('shares one in-flight cycle across overlapping triggers', async () => {
    const settings = Object.assign(createSettings(), {
      sharingEnabled: true,
      sharingDisplayName: 'Penny',
      sharingAffinity: 'river' as const,
      lastPublishedMiles: 10,
    });
    let finishPublish: (() => void) | undefined;
    const service = createService();
    service.enableFriendProgress.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishPublish = resolve;
        }),
    );
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    const firstCycle = workflow.synchronize(15, fetchParticipants);
    const secondCycle = workflow.synchronize(15, fetchParticipants);
    await Promise.resolve();
    finishPublish?.();
    await Promise.all([firstCycle, secondCycle]);

    expect(service.enableFriendProgress).toHaveBeenCalledTimes(1);
    expect(fetchParticipants).toHaveBeenCalledTimes(1);
  });
});
