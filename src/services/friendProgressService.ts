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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import type { FriendAffinity } from '../constants/friendAffinities';

const COLLECTION_NAME = __DEV__ ? 'friend_progress_debug' : 'friend_progress';

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

interface FriendProgressClient {
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
  fetchParticipants: (
    excludedUserId: string,
  ) => Promise<FriendProgressParticipant[]>;
  deleteParticipant: (userId: string) => Promise<void>;
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
  fetchParticipants: async excludedUserId => {
    const participantQuery = query(
      collection(getFirestore(), COLLECTION_NAME),
      where(documentId(), '!=', excludedUserId),
    );
    const snapshot = await getDocs(participantQuery);

    return snapshot.docs
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
  },
  deleteParticipant: userId =>
    deleteDoc(doc(getFirestore(), COLLECTION_NAME, userId)),
};

export const createFriendProgressService = (
  client: FriendProgressClient = firebaseFriendProgressClient,
) => {
  const getExistingUserId = (): string => {
    const userId = client.getCurrentUserId();
    if (!userId) {
      throw new Error('No anonymous sharing session exists');
    }

    return userId;
  };

  const ensureAnonymousUserId = async (): Promise<string> =>
    client.getCurrentUserId() ?? client.signInAnonymously();

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

  const fetchFriendProgress = async (): Promise<FriendProgressParticipant[]> =>
    client.fetchParticipants(getExistingUserId());

  const deleteFriendProgress = async (): Promise<void> => {
    await client.deleteParticipant(getExistingUserId());
    await client.signOut();
  };

  return {
    enableFriendProgress,
    updateFriendDistance,
    updateFriendProfile,
    fetchFriendProgress,
    deleteFriendProgress,
  };
};

export const friendProgressService = createFriendProgressService();
