/**
 * Release notes shown on the "Upgrade" card (SyncErrorBanner's synthesized
 * `newUpgrade` kind) the first time a user opens the app after upgrading
 * into a new version. Keyed by app version (must match package.json's
 * `version`, which is kept in sync with the native build's versionName/
 * MARKETING_VERSION at release time).
 *
 * Only the notes for the version the app is CURRENTLY running are shown —
 * there's no cumulative history here, just "what's new in the version you
 * just landed on". Add an entry here whenever a release ships
 * user-visible changes worth calling out; omit the version (or leave its
 * list empty) for releases with nothing to announce.
 */
export const RELEASE_NOTES: Record<string, string[]> = {
  '1.1.4': [
    'Connect with friends to share progress',
    'Sync health and pedometer to combine the best results',
  ],
};

/**
 * Builds the "In this update:" bullet block for the given version, or ''
 * if that version has no release notes to show.
 */
export function formatReleaseNotes(version: string): string {
  const notes = RELEASE_NOTES[version];
  if (!notes || notes.length === 0) return '';
  return `In this update:\n${notes.map(note => `• ${note}`).join('\n')}`;
}
