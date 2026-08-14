const SURNAME_PREFIXES = [
  'Willow',
  'Hazel',
  'Fern',
  'Apple',
  'Bramble',
  'Copper',
  'Grey',
  'Pebble',
  'Thistle',
  'Meadow',
  'Kettle',
  'Under',
  'Over',
  'Penny',
  'Bumble',
] as const;

const SURNAME_SUFFIXES = [
  'brook',
  'foot',
  'cloak',
  'whistle',
  'meadow',
  'willow',
  'button',
  'wick',
  'croft',
  'bank',
  'bottom',
  'bumble',
] as const;

const selectRandomPart = <Part extends string>(
  parts: readonly Part[],
  random: () => number,
): Part => {
  const index = Math.min(
    parts.length - 1,
    Math.max(0, Math.floor(random() * parts.length)),
  );
  return parts[index];
};

export const generateFantasySurname = (random = Math.random): string => {
  const prefix = selectRandomPart(SURNAME_PREFIXES, random);
  const availableSuffixes = SURNAME_SUFFIXES.filter(
    suffix => suffix !== prefix.toLowerCase(),
  );
  const suffix = selectRandomPart(availableSuffixes, random);
  return `${prefix}${suffix}`;
};

export const combineSharedDisplayName = (
  firstName: string,
  fantasySurname: string,
): string =>
  [firstName.trim(), fantasySurname.trim()].filter(Boolean).join(' ');

export const splitSharedDisplayName = (
  displayName: string | null,
): { firstName: string; fantasySurname: string } => {
  const [firstName = '', ...surnameParts] = (displayName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return { firstName, fantasySurname: surnameParts.join(' ') };
};
