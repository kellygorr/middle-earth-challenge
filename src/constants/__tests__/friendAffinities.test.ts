/**
 * The affinity enum and participant field list are duplicated across
 * TypeScript, Firestore Rules, and the seed script. Nothing links them, so a
 * value added in one place silently fails validation or seeds unreadable rows
 * in another. These tests read the other two surfaces and compare.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { FRIEND_AFFINITIES } from '../friendAffinities';

const repoRoot = join(__dirname, '..', '..', '..');

const readRepoFile = (relativePath: string): string =>
  readFileSync(join(repoRoot, relativePath), 'utf8');

describe('friend affinity cross-layer parity', () => {
  it('matches the affinities allowed by firestore.rules', () => {
    const rules = readRepoFile('firestore.rules');
    const match = rules.match(/data\.affinity in \[([^\]]+)\]/);
    if (!match) {
      throw new Error(
        'Could not find the affinity allow-list in firestore.rules. If the ' +
          'rule was restructured, update this test to match.',
      );
    }

    const ruleAffinities = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    expect(ruleAffinities.sort()).toEqual([...FRIEND_AFFINITIES].sort());
  });

  it('matches the affinities used by the debug seed script', () => {
    const seed = readRepoFile('scripts/seed-firebase-debug-users.mjs');
    const block = seed.match(/const PARTICIPANTS = \[([\s\S]*?)\];/);
    if (!block) {
      throw new Error(
        'Could not find PARTICIPANTS in seed-firebase-debug-users.mjs. If the ' +
          'script was restructured, update this test to match.',
      );
    }

    // Each row is [name, affinity, miles]; the affinity is the second literal.
    const seedAffinities = [
      ...block[1].matchAll(/\[[^\]]*?,\s*'([^']+)'/g),
    ].map(m => m[1]);

    expect(seedAffinities.length).toBeGreaterThan(0);
    expect([...new Set(seedAffinities)].sort()).toEqual(
      [...FRIEND_AFFINITIES].sort(),
    );
  });

  it('matches the participant fields firestore.rules requires', () => {
    const rules = readRepoFile('firestore.rules');
    const match = rules.match(/hasOnly\(\[([^\]]+)\]\)/);
    if (!match) {
      throw new Error('Could not find the participant field list in rules.');
    }

    const ruleFields = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    expect(ruleFields.sort()).toEqual(
      ['affinity', 'displayName', 'distanceMiles', 'shareIdentityId', 'updatedAt'].sort(),
    );
  });

  it('requires a nonblank display name after trimming whitespace', () => {
    const rules = readRepoFile('firestore.rules');

    expect(rules).toContain('data.displayName.trim().size() > 0');
  });
});
