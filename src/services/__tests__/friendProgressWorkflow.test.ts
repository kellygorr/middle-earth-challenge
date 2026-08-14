import { createFriendProgressWorkflow } from '../friendProgressWorkflow';

const createSettings = () => ({
  sharingEnabled: false,
  sharingDeletionPending: false,
  lastPublishedMiles: null as number | null,
  setSharingEnabled: jest.fn(),
  setSharingDisplayName: jest.fn(),
  setSharingAffinity: jest.fn(),
  setSharingDeletionPending: jest.fn(),
  setLastPublishedMiles: jest.fn(),
  setLastSharedProgressSyncAt: jest.fn(),
});

const createService = () => ({
  enableFriendProgress: jest.fn().mockResolvedValue(undefined),
  updateFriendProfile: jest.fn().mockResolvedValue(undefined),
  updateFriendDistance: jest.fn().mockResolvedValue(undefined),
  deleteFriendProgress: jest.fn().mockResolvedValue(undefined),
});

describe('friendProgressWorkflow', () => {
  it('persists opt-in state only after the cloud row is created', async () => {
    const settings = createSettings();
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 1234,
    });

    await workflow.enableSharing('  Penny Greycloak  ', 12.5, 'woodland');

    expect(service.enableFriendProgress).toHaveBeenCalledWith(
      'Penny Greycloak',
      12.5,
      'woodland',
    );
    expect(settings.setSharingDisplayName).toHaveBeenCalledWith(
      'Penny Greycloak',
    );
    expect(settings.setSharingAffinity).toHaveBeenCalledWith('woodland');
    expect(settings.setLastPublishedMiles).toHaveBeenCalledWith(12.5);
    expect(settings.setLastSharedProgressSyncAt).toHaveBeenCalledWith(1234);
    expect(settings.setSharingEnabled).toHaveBeenCalledWith(true);
  });

  it('does not persist opt-in when cloud creation fails', async () => {
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
    expect(settings.setSharingEnabled).not.toHaveBeenCalled();
    expect(settings.setSharingDisplayName).not.toHaveBeenCalled();
  });

  it('updates the local profile only after the cloud row changes', async () => {
    const settings = { ...createSettings(), sharingEnabled: true };
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 5678,
    });

    await workflow.updateProfile('  Penny Hilltop  ', 'hills');

    expect(service.updateFriendProfile).toHaveBeenCalledWith(
      'Penny Hilltop',
      'hills',
    );
    expect(settings.setSharingDisplayName).toHaveBeenCalledWith(
      'Penny Hilltop',
    );
    expect(settings.setSharingAffinity).toHaveBeenCalledWith('hills');
    expect(settings.setLastSharedProgressSyncAt).toHaveBeenCalledWith(5678);
  });

  it('disables locally before deleting and clears all shared state on success', async () => {
    const settings = { ...createSettings(), sharingEnabled: true };
    const service = createService();
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await workflow.disableSharing();

    expect(settings.setSharingEnabled).toHaveBeenCalledWith(false);
    expect(settings.setSharingDeletionPending).toHaveBeenNthCalledWith(1, true);
    expect(service.deleteFriendProgress).toHaveBeenCalledTimes(1);
    expect(settings.setSharingDisplayName).toHaveBeenCalledWith(null);
    expect(settings.setSharingAffinity).toHaveBeenCalledWith(null);
    expect(settings.setLastPublishedMiles).toHaveBeenCalledWith(null);
    expect(settings.setLastSharedProgressSyncAt).toHaveBeenCalledWith(null);
    expect(settings.setSharingDeletionPending).toHaveBeenLastCalledWith(false);
  });

  it('leaves deletion pending when the cloud request fails', async () => {
    const settings = { ...createSettings(), sharingEnabled: true };
    const service = createService();
    service.deleteFriendProgress.mockRejectedValue(new Error('offline'));
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await expect(workflow.disableSharing()).rejects.toThrow('offline');

    expect(settings.setSharingEnabled).toHaveBeenCalledWith(false);
    expect(settings.setSharingDeletionPending).toHaveBeenCalledWith(true);
    expect(settings.setSharingDisplayName).toHaveBeenCalledWith(null);
    expect(settings.setSharingAffinity).toHaveBeenCalledWith(null);
    expect(settings.setLastPublishedMiles).toHaveBeenCalledWith(null);
    expect(settings.setLastSharedProgressSyncAt).toHaveBeenCalledWith(null);
    expect(settings.setSharingDeletionPending).not.toHaveBeenCalledWith(false);
  });

  it('publishes changed distance before fetching participants', async () => {
    const settings = {
      ...createSettings(),
      sharingEnabled: true,
      lastPublishedMiles: 10,
    };
    const service = createService();
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
      now: () => 9012,
    });

    await workflow.synchronize(12.5, fetchParticipants);

    expect(service.updateFriendDistance).toHaveBeenCalledWith(12.5);
    expect(settings.setLastPublishedMiles).toHaveBeenCalledWith(12.5);
    expect(fetchParticipants).toHaveBeenCalledTimes(1);
    expect(
      service.updateFriendDistance.mock.invocationCallOrder[0],
    ).toBeLessThan(fetchParticipants.mock.invocationCallOrder[0]);
    expect(settings.setLastSharedProgressSyncAt).toHaveBeenCalledWith(9012);
  });

  it('fetches without publishing when distance is unchanged', async () => {
    const settings = {
      ...createSettings(),
      sharingEnabled: true,
      lastPublishedMiles: 12.5,
    };
    const service = createService();
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await workflow.synchronize(12.5, fetchParticipants);

    expect(service.updateFriendDistance).not.toHaveBeenCalled();
    expect(fetchParticipants).toHaveBeenCalledTimes(1);
  });

  it('retries pending deletion without publishing or fetching', async () => {
    const settings = {
      ...createSettings(),
      sharingDeletionPending: true,
    };
    const service = createService();
    const fetchParticipants = jest.fn().mockResolvedValue(undefined);
    const workflow = createFriendProgressWorkflow({
      service,
      getSettings: () => settings,
    });

    await workflow.synchronize(12.5, fetchParticipants);

    expect(service.deleteFriendProgress).toHaveBeenCalledTimes(1);
    expect(service.updateFriendDistance).not.toHaveBeenCalled();
    expect(fetchParticipants).not.toHaveBeenCalled();
  });

  it('shares one in-flight cycle across overlapping triggers', async () => {
    const settings = {
      ...createSettings(),
      sharingEnabled: true,
      lastPublishedMiles: 10,
    };
    let finishPublish: (() => void) | undefined;
    const service = createService();
    service.updateFriendDistance.mockImplementation(
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
    finishPublish?.();
    await Promise.all([firstCycle, secondCycle]);

    expect(service.updateFriendDistance).toHaveBeenCalledTimes(1);
    expect(fetchParticipants).toHaveBeenCalledTimes(1);
  });
});
