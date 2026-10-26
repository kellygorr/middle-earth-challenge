import { readFile } from 'node:fs/promises';

const DEBUG_COLLECTION = 'friend_progress_debug';
const CONFIG_PATH = new URL(
  '../android/app/google-services.json',
  import.meta.url,
);
const PARTICIPANTS = [
  ['Rosie Copperbutton', 'woodland', 86],
  ['Sam Bramblefoot', 'river', 241],
  ['Merry Applebrook', 'hills', 517],
  ['Pippin Coastward', 'coast', 724],
  ['Daisy Hearthside', 'cottage', 931],
];

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
const projectId = config.project_info.project_id;
const apiKey = config.client[0].api_key[0].current_key;
const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts`;
const documentRoot = `projects/${projectId}/databases/(default)/documents`;
const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const request = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
};

const createAnonymousUser = () =>
  request(`${authUrl}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });

const deleteAnonymousUser = idToken =>
  request(`${authUrl}:delete?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

const getExistingNames = async idToken => {
  const response = await fetch(`${firestoreUrl}/${DEBUG_COLLECTION}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 404) return new Set();
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return new Set(
    (data.documents ?? []).map(
      document => document.fields.displayName.stringValue,
    ),
  );
};

const createParticipant = async ([displayName, affinity, distanceMiles]) => {
  const user = await createAnonymousUser();
  const documentName = `${documentRoot}/${DEBUG_COLLECTION}/${user.localId}`;

  try {
    await request(`${firestoreUrl}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: documentName,
              fields: {
                displayName: { stringValue: displayName },
                affinity: { stringValue: affinity },
                distanceMiles: { doubleValue: distanceMiles },
              },
            },
            updateTransforms: [
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    await deleteAnonymousUser(user.idToken);
    throw error;
  }

  console.log(`Created ${displayName} (${user.localId})`);
};

const reader = await createAnonymousUser();
try {
  const existingNames = await getExistingNames(reader.idToken);
  for (const participant of PARTICIPANTS) {
    if (existingNames.has(participant[0])) {
      console.log(`Skipped ${participant[0]} (already exists)`);
    } else {
      await createParticipant(participant);
    }
  }
} finally {
  await deleteAnonymousUser(reader.idToken);
}
