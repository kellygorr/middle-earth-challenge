import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';

import FriendProgressContent from '../FriendProgressContent';
import { friendProgressWorkflow } from '../../../../services/friendProgressWorkflow';
import { useFriendProgressStore } from '../../../../stores/friendProgressStore';
import { useProgressStore } from '../../../../stores/progressStore';
import { useSettingsStore } from '../../../../stores/settingsStore';

jest.mock('../../../../services/friendProgressWorkflow', () => ({
  friendProgressWorkflow: {
    enableSharing: jest.fn(),
    disableSharing: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

const mockedWorkflow = friendProgressWorkflow as jest.Mocked<
  typeof friendProgressWorkflow
>;

describe('FriendProgressContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useSettingsStore.setState({
      sharingEnabled: false,
      sharingDisplayName: null,
      sharingAffinity: null,
      sharingProvisioningPending: false,
      sharingDeletionPending: false,
    });
    useProgressStore.setState({
      getTotalMiles: () => 12,
    } as unknown as Parameters<typeof useProgressStore.setState>[0]);
    useFriendProgressStore.setState({
      showKelly: jest.fn(),
      fetchParticipants: jest.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof useFriendProgressStore.setState>[0]);
  });

  it('publishes once when Start sharing is pressed repeatedly', async () => {
    const user = userEvent.setup();
    // Hold the first attempt open so later presses land while it is still in
    // flight — the case the disabled prop alone cannot cover.
    let releaseFirstAttempt: (() => void) | undefined;
    mockedWorkflow.enableSharing.mockReturnValue(
      new Promise<void>(resolve => {
        releaseFirstAttempt = resolve;
      }),
    );

    await render(<FriendProgressContent />);

    const start = screen.getByText('Start sharing');
    await user.press(start);
    await user.press(start);
    await user.press(start);

    expect(mockedWorkflow.enableSharing).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirstAttempt?.();
    });
  });

  it('allows a retry after the previous attempt fails', async () => {
    const user = userEvent.setup();
    mockedWorkflow.enableSharing
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);

    await render(<FriendProgressContent />);

    const start = screen.getByText('Start sharing');
    await user.press(start);
    await user.press(start);

    expect(mockedWorkflow.enableSharing).toHaveBeenCalledTimes(2);
  });
});
