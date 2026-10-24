import * as fs from 'fs';
import * as path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'middle-earth-rules-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

// Matches the 15-minute non-owner-delete staleness gate in firestore.rules.
const STALE_PARTICIPANT_MINUTES = 15;

const validParticipant = (overrides: Record<string, unknown> = {}) => ({
  displayName: 'Frodo of the Shire',
  affinity: 'woodland',
  distanceMiles: 12,
  updatedAt: serverTimestamp(),
  ...overrides,
});

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(
        path.resolve(__dirname, '../firestore.rules'),
        'utf8',
      ),
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe.each(['friend_progress', 'friend_progress_debug'])(
  'firestore.rules %s',
  collectionName => {
    it('allows the owner to create their own participant document', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(
        setDoc(
          doc(alice.firestore(), collectionName, 'alice'),
          validParticipant(),
        ),
      );
    });

    it("rejects writing another user's participant document", async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertFails(
        setDoc(
          doc(alice.firestore(), collectionName, 'bob'),
          validParticipant(),
        ),
      );
    });

    it('rejects malformed participant documents', async () => {
      const alice = testEnv.authenticatedContext('alice');
      await assertFails(
        setDoc(
          doc(alice.firestore(), collectionName, 'alice'),
          validParticipant({ distanceMiles: -1 }),
        ),
      );
    });

    it('allows any authenticated user to read participants', async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant(),
        );
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertSucceeds(getDoc(doc(bob.firestore(), collectionName, 'alice')));
    });

    it('rejects reads without authentication', async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant(),
        );
      });

      const anonymous = testEnv.unauthenticatedContext();
      await assertFails(
        getDoc(doc(anonymous.firestore(), collectionName, 'alice')),
      );
    });

    it('allows the owner to delete their own participant document', async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant(),
        );
      });

      const alice = testEnv.authenticatedContext('alice');
      await assertSucceeds(
        deleteDoc(doc(alice.firestore(), collectionName, 'alice')),
      );
    });

    it('allows a different authenticated user to delete a stale migrated participant document', async () => {
      // Mirrors deleteFriendProgressByUserId: after importing a backup
      // exported while sharing was active, the destination phone (bob) is
      // authenticated under its own anonymous UID and must clean up the
      // stale row still owned by the source phone's old UID (alice) —
      // but only once that row is actually stale (see the "rejects... a
      // live" test below for the anti-griefing counterpart).
      const staleTimestamp = Timestamp.fromMillis(
        Date.now() - (STALE_PARTICIPANT_MINUTES + 1) * 60 * 1000,
      );
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant({ updatedAt: staleTimestamp }),
        );
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertSucceeds(
        deleteDoc(doc(bob.firestore(), collectionName, 'alice')),
      );
    });

    it("rejects a different authenticated user deleting a live participant's document", async () => {
      // Anti-griefing regression guard: a non-owner must not be able to
      // delete a row that is still being actively republished (updatedAt
      // within the staleness window), even though the cross-UID delete
      // path exists for migration cleanup.
      const freshTimestamp = Timestamp.fromMillis(Date.now() - 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant({ updatedAt: freshTimestamp }),
        );
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertFails(
        deleteDoc(doc(bob.firestore(), collectionName, 'alice')),
      );
    });

    it('rejects deletion without authentication', async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant(),
        );
      });

      const anonymous = testEnv.unauthenticatedContext();
      await assertFails(
        deleteDoc(doc(anonymous.firestore(), collectionName, 'alice')),
      );
    });
  },
);
