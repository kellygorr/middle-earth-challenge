import {
  getAuth,
  signInAnonymously,
  signOut,
} from '@react-native-firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  waitForPendingWrites,
  where,
} from '@react-native-firebase/firestore';

import type { FriendAffinity } from '../constants/friendAffinities';

const COLLECTION_NAME = __DEV__ ? 'friend_progress_debug' : 'friend_progress';
export const FRIEND_PROGRESS_PARTICIPANT_LIMIT = 50;

interface FriendProgressDocument {
  affinity: FriendAffinity;
  displayName: string;
  distanceMiles: number;
  updatedAt: unknown;
}

export interface FriendProgressParticipant {
  userId: string;
  affinity: FriendAffinity;
  displayName: string;
  distanceMiles: number;
  updatedAt: string;
}

export interface FriendProgressPage {
  participants: FriendProgressParticipant[];
  nextCursor: string | null;
}

interface FriendProgressClient {
  waitForAuthState: () => Promise<void>;
  getCurrentUserId: () => string | null;
  signInAnonymously: () => Promise<string>;
  signOut: () => Promise<void>;
  setParticipant: (
    userId: string,
    participant: Omit<FriendProgressDocument, 'updatedAt'>,
  ) => Promise<void>;
  updateParticipant: (
    userId: string,
    participant: Partial<Omit<FriendProgressDocument, 'updatedAt'>>,
  ) => Promise<void>;
  fetchParticipantPage: (
    excludedUserId: string,
    participantLimit: number,
    cursor: string | null,
  ) => Promise<FriendProgressPage>;
  deleteParticipant: (userId: string) => Promise<void>;
  flushPendingWrites: () => Promise<void>;
}

const timestampToIsoString = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().toISOString();
  }

  return new Date(0).toISOString();
};

const firebaseFriendProgressClient: FriendProgressClient = {
  waitForAuthState: () => getAuth().authStateReady(),
  getCurrentUserId: () => getAuth().currentUser?.uid ?? null,
  signInAnonymously: async () => {
    const credential = await signInAnonymously(getAuth());
    return credential.user.uid;
  },
  signOut: () => signOut(getAuth()),
  setParticipant: async (userId, participant) => {
    await setDoc(doc(getFirestore(), COLLECTION_NAME, userId), {
      ...participant,
      updatedAt: serverTimestamp(),
    });
  },
  updateParticipant: async (userId, participant) => {
    await updateDoc(doc(getFirestore(), COLLECTION_NAME, userId), {
      ...participant,
      updatedAt: serverTimestamp(),
    });
  },
  fetchParticipantPage: async (excludedUserId, participantLimit, cursor) => {
    const participantConstraints = [
      where(documentId(), '!=', excludedUserId),
      orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(participantLimit),
    ];
    const participantQuery = query(
      collection(getFirestore(), COLLECTION_NAME),
      ...participantConstraints,
    );
    const snapshot = await getDocs(participantQuery);
    const participants = snapshot.docs
      .map(participantSnapshot => {
        const participant =
          participantSnapshot.data() as FriendProgressDocument;
        return {
          userId: participantSnapshot.id,
          affinity: participant.affinity,
          displayName: participant.displayName,
          distanceMiles: participant.distanceMiles,
          updatedAt: timestampToIsoString(participant.updatedAt),
        };
      })
      .sort((left, right) => right.distanceMiles - left.distanceMiles);

    return {
      participants,
      nextCursor:
        snapshot.docs.length === participantLimit
          ? snapshot.docs[snapshot.docs.length - 1].id
          : null,
    };
  },
  deleteParticipant: userId =>
    deleteDoc(doc(getFirestore(), COLLECTION_NAME, userId)),
  flushPendingWrites: () => waitForPendingWrites(getFirestore()),
};

export const createFriendProgressService = (
  client: FriendProgressClient = firebaseFriendProgressClient,
) => {
  let signInInFlight: Promise<string> | null = null;

  const getExistingUserId = (): string => {
    const userId = client.getCurrentUserId();
    if (!userId) {
      throw new Error('No anonymous sharing session exists');
    }

    return userId;
  };

  const ensureAnonymousUserId = async (): Promise<string> => {
    await client.waitForAuthState();
    const currentUserId = client.getCurrentUserId();
    if (currentUserId) return currentUserId;

    if (!signInInFlight) {
      signInInFlight = client.signInAnonymously().finally(() => {
        signInInFlight = null;
      });
    }
    return signInInFlight;
  };

  const enableFriendProgress = async (
    displayName: string,
    distanceMiles: number,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const normalizedName = displayName.trim();

    if (!normalizedName) {
      throw new Error('Display name is required');
    }
    if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
      throw new Error('Distance must be a nonnegative number');
    }

    const userId = await ensureAnonymousUserId();
    await client.setParticipant(userId, {
      displayName: normalizedName,
      distanceMiles,
      affinity,
    });
  };

  const updateFriendDistance = async (distanceMiles: number): Promise<void> => {
    if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
      throw new Error('Distance must be a nonnegative number');
    }

    await client.updateParticipant(getExistingUserId(), { distanceMiles });
  };

  const updateFriendProfile = async (
    displayName: string,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const normalizedName = displayName.trim();

    if (!normalizedName) {
      throw new Error('Display name is required');
    }

    await client.updateParticipant(getExistingUserId(), {
      displayName: normalizedName,
      affinity,
    });
  };

  const fetchFriendProgressPage = async (
    cursor: string | null = null,
  ): Promise<FriendProgressPage> =>
    client.fetchParticipantPage(
      getExistingUserId(),
      FRIEND_PROGRESS_PARTICIPANT_LIMIT,
      cursor,
    );

  const fetchFriendProgress = async (): Promise<FriendProgressParticipant[]> =>
    (await fetchFriendProgressPage()).participants;

  const deleteFriendProgress = async (): Promise<void> => {
    // Hydration must complete first; a null user here is indistinguishable from
    // a signed-out one, and skipping the delete strands the row permanently.
    await client.waitForAuthState();
    const userId = client.getCurrentUserId();
    if (!userId) return;

    await client.deleteParticipant(userId);
    // On Android the delete resolves once queued locally. Signing out before it
    // reaches the server drops the write and strands the document forever,
    // because the owner-only rule leaves no session able to retry it.
    await client.flushPendingWrites();
    await client.signOut();
  };

  return {
    enableFriendProgress,
    updateFriendDistance,
    updateFriendProfile,
    fetchFriendProgressPage,
    fetchFriendProgress,
    deleteFriendProgress,
  };
};

export const friendProgressService = createFriendProgressService();
