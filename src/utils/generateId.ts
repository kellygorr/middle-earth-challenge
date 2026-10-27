/**
 * Generates a locally-created, practically-unique identifier. Not
 * cryptographically secure — only used to tag a device's own sharing
 * identity so repeated backup imports can be recognized as the same
 * person and deduplicated, never as a security/ownership credential
 * (that remains the Firebase anonymous Auth UID; see firestore.rules).
 */
export const generateShareIdentityId = (): string => {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `share_${Date.now().toString(36)}_${randomPart}`;
};
