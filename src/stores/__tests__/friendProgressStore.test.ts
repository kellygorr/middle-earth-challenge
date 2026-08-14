const mockFetchFriendProgress = jest.fn();

import type { FriendProgressParticipant } from '../../services/friendProgressService';
import { createFriendProgressStore } from '../friendProgressStore';

const REAL_PARTICIPANTS: FriendProgressParticipant[] = [
  {
    userId: 'friend-1',
    affinity: 'coast',
    displayName: 'Coral Underhill',
    distanceMiles: 42,
    updatedAt: '2026-08-04T12:00:00Z',
  },
];

describe('friendProgressStore', () => {
  const useFriendProgressStore = createFriendProgressStore(
    mockFetchFriendProgress,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    useFriendProgressStore.setState({
      participants: [],
      realParticipants: [],
      fakeParticipantsEnabled: false,
      isFetching: false,
      fetchError: null,
    });
  });

  it('fetches and displays real participants', async () => {
    mockFetchFriendProgress.mockResolvedValue(REAL_PARTICIPANTS);

    await useFriendProgressStore.getState().fetchParticipants();

    expect(useFriendProgressStore.getState().participants).toEqual(
      REAL_PARTICIPANTS,
    );
    expect(useFriendProgressStore.getState().fetchError).toBeNull();
  });

  it('uses all five affinities in fake mode and restores fetched rows', async () => {
    mockFetchFriendProgress.mockResolvedValue(REAL_PARTICIPANTS);
    await useFriendProgressStore.getState().fetchParticipants();

    useFriendProgressStore.getState().setFakeParticipantsEnabled(true);
    expect(
      useFriendProgressStore
        .getState()
        .participants.filter(participant => !participant.markerMessage)
        .map(participant => participant.affinity),
    ).toEqual(['woodland', 'river', 'hills', 'coast', 'cottage']);
    expect(
      useFriendProgressStore
        .getState()
        .participants.some(participant => participant.markerMessage),
    ).toBe(true);

    useFriendProgressStore.getState().setFakeParticipantsEnabled(false);
    expect(useFriendProgressStore.getState().participants).toEqual(
      REAL_PARTICIPANTS,
    );
  });

  it('retains cached participants when a refresh fails', async () => {
    useFriendProgressStore.setState({
      participants: REAL_PARTICIPANTS,
      realParticipants: REAL_PARTICIPANTS,
    });
    mockFetchFriendProgress.mockRejectedValue(new Error('offline'));

    await expect(
      useFriendProgressStore.getState().fetchParticipants(),
    ).rejects.toThrow('offline');

    expect(useFriendProgressStore.getState().participants).toEqual(
      REAL_PARTICIPANTS,
    );
    expect(useFriendProgressStore.getState().fetchError).toBe('offline');
  });
});
