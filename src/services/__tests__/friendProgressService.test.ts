jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  documentId: jest.fn(),
  getDocs: jest.fn(),
  getFirestore: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));

import { createFriendProgressService } from '../friendProgressService';

const mockGetCurrentUserId = jest.fn<string | null, []>();
const mockSignInAnonymously = jest.fn<Promise<string>, []>();
const mockSignOut = jest.fn<Promise<void>, []>();
const mockSetParticipant = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockFetchParticipants = jest.fn();
const mockDeleteParticipant = jest.fn();

const createService = () =>
  createFriendProgressService({
    getCurrentUserId: mockGetCurrentUserId,
    signInAnonymously: mockSignInAnonymously,
    signOut: mockSignOut,
    setParticipant: mockSetParticipant,
    updateParticipant: mockUpdateParticipant,
    fetchParticipants: mockFetchParticipants,
    deleteParticipant: mockDeleteParticipant,
  });

describe('friendProgressService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockReturnValue('user-1');
    mockSignOut.mockResolvedValue();
    mockSetParticipant.mockResolvedValue(undefined);
    mockUpdateParticipant.mockResolvedValue(undefined);
    mockFetchParticipants.mockResolvedValue([]);
    mockDeleteParticipant.mockResolvedValue(undefined);
  });

  it('creates an anonymous session and enables sharing', async () => {
    mockGetCurrentUserId.mockReturnValue(null);
    mockSignInAnonymously.mockResolvedValue('anonymous-user');

    await createService().enableFriendProgress('  Kelly  ', 12.5, 'river');

    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
    expect(mockSetParticipant).toHaveBeenCalledWith('anonymous-user', {
      displayName: 'Kelly',
      distanceMiles: 12.5,
      affinity: 'river',
    });
  });

  it('reuses an existing anonymous session when enabling sharing', async () => {
    await createService().enableFriendProgress('Kelly', 15, 'hills');

    expect(mockSignInAnonymously).not.toHaveBeenCalled();
    expect(mockSetParticipant).toHaveBeenCalledWith('user-1', {
      displayName: 'Kelly',
      distanceMiles: 15,
      affinity: 'hills',
    });
  });

  it('rejects invalid values before authentication or publishing', async () => {
    const service = createService();

    await expect(
      service.enableFriendProgress('   ', 1, 'coast'),
    ).rejects.toThrow('Display name is required');
    await expect(
      service.enableFriendProgress('Kelly', -1, 'coast'),
    ).rejects.toThrow('Distance must be a nonnegative number');

    expect(mockGetCurrentUserId).not.toHaveBeenCalled();
    expect(mockSetParticipant).not.toHaveBeenCalled();
  });

  it('updates only the absolute distance during routine sync', async () => {
    await createService().updateFriendDistance(18.25);

    expect(mockUpdateParticipant).toHaveBeenCalledWith('user-1', {
      distanceMiles: 18.25,
    });
  });

  it('updates the display name and affinity as one profile', async () => {
    await createService().updateFriendProfile('  Kelly G  ', 'cottage');

    expect(mockUpdateParticipant).toHaveBeenCalledWith('user-1', {
      displayName: 'Kelly G',
      affinity: 'cottage',
    });
  });

  it('fetches participants while excluding the current user server-side', async () => {
    const participants = [
      {
        userId: 'user-2',
        affinity: 'coast' as const,
        displayName: 'Sarah',
        distanceMiles: 20,
        updatedAt: '2026-07-30T12:00:00.000Z',
      },
    ];
    mockFetchParticipants.mockResolvedValue(participants);

    await expect(createService().fetchFriendProgress()).resolves.toEqual(
      participants,
    );
    expect(mockFetchParticipants).toHaveBeenCalledWith('user-1');
  });

  it('deletes only the existing session user document and signs out', async () => {
    await createService().deleteFriendProgress();

    expect(mockDeleteParticipant).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('does not create a new identity while deleting without a session', async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    await expect(createService().deleteFriendProgress()).rejects.toThrow(
      'No anonymous sharing session exists',
    );
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
    expect(mockDeleteParticipant).not.toHaveBeenCalled();
  });
});
