import type { Theme } from '../styles/themes';

export const FRIEND_AFFINITIES = [
  'woodland',
  'river',
  'hills',
  'coast',
  'cottage',
] as const;

export type FriendAffinity = (typeof FRIEND_AFFINITIES)[number];

export const FRIEND_AFFINITY_LABELS: Record<FriendAffinity, string> = {
  woodland: 'Woodland',
  river: 'River',
  hills: 'Hills',
  coast: 'Coast',
  cottage: 'Cottage',
};

export const getFriendAffinityColor = (
  affinity: FriendAffinity,
  theme: Theme,
): string => {
  const colors: Record<FriendAffinity, string> = {
    woodland: theme.colors.svgTrees,
    river: theme.colors.svgWater,
    hills: theme.colors.svgMountains,
    coast: theme.colors.svgCoastline,
    cottage: theme.colors.svgStreets,
  };
  return colors[affinity];
};
