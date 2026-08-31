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
  limit: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  startAfter: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));

import {
  createFriendProgressService,
  FRIEND_PROGRESS_PARTICIPANT_LIMIT,
  friendProgressService,
  parseParticipantDocument,
} from '../friendProgressService';
import { getAuth } from '@react-native-firebase/auth';
import {
  documentId,
  getDocs,
  limit,
  orderBy,
  startAfter,
  where,
} from '@react-native-firebase/firestore';

const mockGetCurrentUserId = jest.fn<string | null, []>();
const mockWaitForAuthState = jest.fn<Promise<void>, []>();
const mockSignInAnonymously = jest.fn<Promise<string>, []>();
const mockSignOut = jest.fn<Promise<void>, []>();
const mockSetParticipant = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockFetchParticipantPage = jest.fn();
const mockDeleteParticipant = jest.fn();
const mockFlushPendingWrites = jest.fn<Promise<void>, []>();

const createService = () =>
  createFriendProgressService({
    waitForAuthState: mockWaitForAuthState,
    getCurrentUserId: mockGetCurrentUserId,
    signInAnonymously: mockSignInAnonymously,
    signOut: mockSignOut,
    setParticipant: mockSetParticipant,
    updateParticipant: mockUpdateParticipant,
    fetchParticipantPage: mockFetchParticipantPage,
    deleteParticipant: mockDeleteParticipant,
    flushPendingWrites: mockFlushPendingWrites,
  });

describe('parseParticipantDocument', () => {
  const validDoc = {
    affinity: 'woodland',
    displayName: 'Frodo of the Shire',
    distanceMiles: 42,
    updatedAt: null,
  };

  it('accepts a well-formed document', () => {
    expect(parseParticipantDocument('user-1', validDoc)).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        affinity: 'woodland',
        displayName: 'Frodo of the Shire',
        distanceMiles: 42,
      }),
    );
  });

  it.each([
    ['an unknown affinity', { ...validDoc, affinity: 'volcano' }],
    ['a missing affinity', { ...validDoc, affinity: undefined }],
    ['a blank display name', { ...validDoc, displayName: '   ' }],
    ['a non-string display name', { ...validDoc, displayName: 42 }],
    ['a non-numeric distance', { ...validDoc, distanceMiles: '12' }],
    ['a negative distance', { ...validDoc, distanceMiles: -1 }],
    ['a non-finite distance', { ...validDoc, distanceMiles: Infinity }],
    ['a null document', null],
  ])('rejects %s', (_label, doc) => {
    expect(parseParticipantDocument('user-1', doc)).toBeNull();
  });
});

describe('friendProgressService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWaitForAuthState.mockResolvedValue();
    mockGetCurrentUserId.mockReturnValue('user-1');
    mockSignOut.mockResolvedValue();
    mockFlushPendingWrites.mockResolvedValue();
    mockSetParticipant.mockResolvedValue(undefined);
    mockUpdateParticipant.mockResolvedValue(undefined);
    mockFetchParticipantPage.mockResolvedValue({
      participants: [],
      nextCursor: null,
    });
    mockDeleteParticipant.mockResolvedValue(undefined);
  });

  it('creates an anonymous session and enables sharing', async () => {
    mockGetCurrentUserId.mockReturnValue(null);
    mockSignInAnonymously.mockResolvedValue('anonymous-user');

    await createService().enableFriendProgress('  Kelly  ', 12.5, 'river');

    expect(mockWaitForAuthState).toHaveBeenCalledTimes(1);
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

  it('waits for persisted auth before choosing the participant owner', async () => {
    mockGetCurrentUserId.mockReturnValue('restored-user');

    await createService().enableFriendProgress('Kelly', 15, 'hills');

    expect(mockWaitForAuthState).toHaveBeenCalledTimes(1);
    expect(mockSetParticipant).toHaveBeenCalledWith('restored-user', {
      displayName: 'Kelly',
      distanceMiles: 15,
      affinity: 'hills',
    });
  });

  it('shares one anonymous session across concurrent enable attempts', async () => {
    mockGetCurrentUserId.mockReturnValue(null);
    mockSignInAnonymously.mockResolvedValue('shared-anonymous-user');
    const service = createService();

    await Promise.all([
      service.enableFriendProgress('Kelly', 15, 'hills'),
      service.enableFriendProgress('Kelly', 15, 'hills'),
    ]);

    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
    expect(mockSetParticipant).toHaveBeenNthCalledWith(
      1,
      'shared-anonymous-user',
      {
        displayName: 'Kelly',
        distanceMiles: 15,
        affinity: 'hills',
      },
    );
    expect(mockSetParticipant).toHaveBeenNthCalledWith(
      2,
      'shared-anonymous-user',
      {
        displayName: 'Kelly',
        distanceMiles: 15,
        affinity: 'hills',
      },
    );
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
    mockFetchParticipantPage.mockResolvedValue({
      participants,
      nextCursor: null,
    });

    await expect(createService().fetchFriendProgress()).resolves.toEqual(
      participants,
    );
    expect(mockFetchParticipantPage).toHaveBeenCalledWith(
      'user-1',
      FRIEND_PROGRESS_PARTICIPANT_LIMIT,
      null,
    );
  });

  it('waits for auth hydration before fetching participants', async () => {
    let resolveAuthState: (() => void) | undefined;
    mockWaitForAuthState.mockReturnValue(
      new Promise<void>(resolve => {
        resolveAuthState = resolve;
      }),
    );
    mockGetCurrentUserId.mockReturnValue(null);

    const fetch = createService().fetchFriendProgress();
    await Promise.resolve();
    expect(mockFetchParticipantPage).not.toHaveBeenCalled();

    mockGetCurrentUserId.mockReturnValue('restored-user');
    resolveAuthState?.();
    await expect(fetch).resolves.toEqual([]);
    expect(mockFetchParticipantPage).toHaveBeenCalledWith(
      'restored-user',
      FRIEND_PROGRESS_PARTICIPANT_LIMIT,
      null,
    );
  });

  it('returns a continuation cursor for an explicitly requested page', async () => {
    mockFetchParticipantPage.mockResolvedValue({
      participants: [],
      nextCursor: 'user-50',
    });

    await expect(
      createService().fetchFriendProgressPage('user-25'),
    ).resolves.toEqual({ participants: [], nextCursor: 'user-50' });
    expect(mockFetchParticipantPage).toHaveBeenCalledWith(
      'user-1',
      FRIEND_PROGRESS_PARTICIPANT_LIMIT,
      'user-25',
    );
  });

  it('builds a stable bounded Firestore query for a continuation page', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      currentUser: { uid: 'user-1' },
      authStateReady: jest.fn().mockResolvedValue(undefined),
    });
    (documentId as jest.Mock).mockReturnValue('__name__');
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await friendProgressService.fetchFriendProgressPage('user-25');

    expect(where).toHaveBeenCalledWith('__name__', '!=', 'user-1');
    expect(orderBy).toHaveBeenCalledWith('__name__');
    expect(startAfter).toHaveBeenCalledWith('user-25');
    expect(limit).toHaveBeenCalledWith(FRIEND_PROGRESS_PARTICIPANT_LIMIT);
  });

  it('deletes only the existing session user document and signs out', async () => {
    await createService().deleteFriendProgress();

    expect(mockDeleteParticipant).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('treats deletion without a session as already complete', async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    await expect(
      createService().deleteFriendProgress(),
    ).resolves.toBeUndefined();
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
    expect(mockDeleteParticipant).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('waits for auth hydration before reading the session user', async () => {
    let resolveAuthState: (() => void) | undefined;
    mockWaitForAuthState.mockReturnValue(
      new Promise<void>(resolve => {
        resolveAuthState = resolve;
      }),
    );
    mockGetCurrentUserId.mockReturnValue(null);

    const deletion = createService().deleteFriendProgress();
    mockGetCurrentUserId.mockReturnValue('hydrated-user');
    resolveAuthState?.();
    await deletion;

    expect(mockDeleteParticipant).toHaveBeenCalledWith('hydrated-user');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('flushes the queued delete to the server before signing out', async () => {
    const callOrder: string[] = [];
    mockDeleteParticipant.mockImplementation(async () => {
      callOrder.push('delete');
    });
    mockFlushPendingWrites.mockImplementation(async () => {
      callOrder.push('flush');
    });
    mockSignOut.mockImplementation(async () => {
      callOrder.push('signOut');
    });

    await createService().deleteFriendProgress();

    expect(callOrder).toEqual(['delete', 'flush', 'signOut']);
  });

  it('keeps the session when the queued delete cannot reach the server', async () => {
    mockFlushPendingWrites.mockRejectedValue(new Error('offline'));

    await expect(createService().deleteFriendProgress()).rejects.toThrow(
      'offline',
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
