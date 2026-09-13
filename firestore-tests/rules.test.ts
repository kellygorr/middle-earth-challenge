import * as fs from 'fs';
import * as path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'middle-earth-rules-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

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
      // stale row still owned by the source phone's old UID (alice).
      await testEnv.withSecurityRulesDisabled(async context => {
        await setDoc(
          doc(context.firestore(), collectionName, 'alice'),
          validParticipant(),
        );
      });

      const bob = testEnv.authenticatedContext('bob');
      await assertSucceeds(
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
