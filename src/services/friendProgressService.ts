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

import {
  FRIEND_AFFINITIES,
  type FriendAffinity,
} from '../constants/friendAffinities';
import { FRIEND_PROGRESS_NETWORK_TIMEOUT_MS } from '../constants/sync';
import { withTimeout } from '../utils/withTimeout';

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

/**
 * Security Rules constrain normal client writes, but an admin edit, a seed
 * mistake, or a legacy row can still contain values we never write. Returning
 * null skips the row rather than letting it poison sorting and map rendering.
 */
export const parseParticipantDocument = (
  userId: string,
  raw: unknown,
): FriendProgressParticipant | null => {
  if (!raw || typeof raw !== 'object') return null;
  const fields = raw as Record<string, unknown>;

  const affinity = fields.affinity;
  if (
    typeof affinity !== 'string' ||
    !(FRIEND_AFFINITIES as readonly string[]).includes(affinity)
  ) {
    return null;
  }

  const displayName = fields.displayName;
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return null;
  }

  const distanceMiles = fields.distanceMiles;
  if (
    typeof distanceMiles !== 'number' ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0
  ) {
    return null;
  }

  return {
    userId,
    affinity: affinity as FriendAffinity,
    displayName,
    distanceMiles,
    updatedAt: timestampToIsoString(fields.updatedAt),
  };
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
    // setDoc (not updateDoc) is deliberate: create-or-replace lets this
    // device silently recreate its own row if another device's migration
    // cleanup ever deleted it (see deleteFriendProgressByUserId's comment)
    // — no "document not found" failure, no re-provisioning flow needed.
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
        const participant = parseParticipantDocument(
          participantSnapshot.id,
          participantSnapshot.data(),
        );
        if (!participant) {
          console.warn('[friendProgress] skipped malformed participant', {
            userId: participantSnapshot.id,
          });
        }
        return participant;
      })
      .filter((participant): participant is FriendProgressParticipant =>
        Boolean(participant),
      )
      .sort((left, right) => right.distanceMiles - left.distanceMiles);

    return {
      participants,
      nextCursor:
        // Paging is driven by documents read, not documents kept, so a page
        // of skipped rows must still advance the cursor.
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

  // Every network-bound client.* call below is wrapped with this at its
  // await point, inside the function that owns any statements after it —
  // never wrapping a whole function from outside. That means a timeout here
  // only ever skips the rest of *that* function's body (it throws before
  // reaching later statements, e.g. deleteFriendProgress's signOut()); it
  // never abandons a side effect to fire later from a detached background
  // continuation. See withTimeout's own doc comment for why that
  // distinction matters.
  const withNetworkTimeout = <T>(promise: Promise<T>): Promise<T> =>
    withTimeout(
      promise,
      FRIEND_PROGRESS_NETWORK_TIMEOUT_MS,
      'friend-progress-network-timeout',
    );

  const getExistingUserId = async (): Promise<string> => {
    await client.waitForAuthState();
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
      signInInFlight = withNetworkTimeout(client.signInAnonymously()).finally(
        () => {
          signInInFlight = null;
        },
      );
    }
    return signInInFlight;
  };

  const getCurrentUserId = async (): Promise<string | null> => {
    await client.waitForAuthState();
    return client.getCurrentUserId();
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
    await withNetworkTimeout(
      client.setParticipant(userId, {
        displayName: normalizedName,
        distanceMiles,
        affinity,
      }),
    );
  };

  const updateFriendDistance = async (distanceMiles: number): Promise<void> => {
    if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
      throw new Error('Distance must be a nonnegative number');
    }

    await withNetworkTimeout(
      client.updateParticipant(await getExistingUserId(), {
        distanceMiles,
      }),
    );
  };

  const updateFriendProfile = async (
    displayName: string,
    affinity: FriendAffinity,
  ): Promise<void> => {
    const normalizedName = displayName.trim();

    if (!normalizedName) {
      throw new Error('Display name is required');
    }

    await withNetworkTimeout(
      client.updateParticipant(await getExistingUserId(), {
        displayName: normalizedName,
        affinity,
      }),
    );
  };

  const fetchFriendProgressPage = async (
    cursor: string | null = null,
  ): Promise<FriendProgressPage> => {
    const userId = await getExistingUserId();
    return withNetworkTimeout(
      client.fetchParticipantPage(
        userId,
        FRIEND_PROGRESS_PARTICIPANT_LIMIT,
        cursor,
      ),
    );
  };

  const fetchFriendProgress = async (): Promise<FriendProgressParticipant[]> =>
    (await fetchFriendProgressPage()).participants;

  const deleteFriendProgress = async (): Promise<void> => {
    // Hydration must complete first; a null user here is indistinguishable from
    // a signed-out one, and skipping the delete strands the row permanently.
    await client.waitForAuthState();
    const userId = client.getCurrentUserId();
    if (!userId) return;

    await withNetworkTimeout(client.deleteParticipant(userId));
    // On Android the delete resolves once queued locally. Signing out before it
    // reaches the server drops the write and strands the document forever,
    // because the owner-only rule leaves no session able to retry it. If the
    // flush times out, signOut() below is never reached (the timeout throws)
    // — the write stays queued locally under the same still-signed-in
    // session, so a future retry (periodic sync or manual) can pick up
    // exactly where this attempt left off.
    await withNetworkTimeout(client.flushPendingWrites());
    await client.signOut();
  };

  /**
   * Deletes another device's stale participant row after a backup import
   * migrates its sharing identity to this device. Deliberately does not
   * touch the source device's own Firebase Auth session or local settings
   * in any way — if that device is still running and still shares (an
   * export doesn't disable sharing), it will simply recreate this document
   * under its own unchanged UID the next time its distance changes, via
   * enableFriendProgress()'s setDoc (create-or-replace, not requiring the
   * doc to pre-exist). That is intended: at that point the two devices are
   * independent participants again, not a broken or duplicate identity —
   * migrating away from a device doesn't revoke its ability to keep
   * sharing on its own if the user goes back to it. The only user-visible
   * effect is a brief gap on friends' leaderboards until it republishes.
   */
  const deleteFriendProgressByUserId = async (
    userId: string,
  ): Promise<void> => {
    const currentUserId = await ensureAnonymousUserId();
    if (currentUserId === userId) return;

    await withNetworkTimeout(client.deleteParticipant(userId));
    await withNetworkTimeout(client.flushPendingWrites());
  };

  return {
    getCurrentUserId,
    enableFriendProgress,
    updateFriendDistance,
    updateFriendProfile,
    fetchFriendProgressPage,
    fetchFriendProgress,
    deleteFriendProgress,
    deleteFriendProgressByUserId,
  };
};

export const friendProgressService = createFriendProgressService();
