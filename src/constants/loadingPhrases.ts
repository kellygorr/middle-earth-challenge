/**
 * Flavor text shown on the splash screen while the app loads, in place of a
 * plain "Loading". One is picked at random per app launch (see
 * pickRandomLoadingPhrase). Deliberately NOT used for the "Upgrading" splash
 * state — that copy needs to stay literal so a user mid-migration knows
 * exactly what's happening (see App.tsx's SplashOverlay usage).
 */
export const LOADING_PHRASES: string[] = [
  'Putting the kettle on',
  'Hitting the road',
  'Making second breakfast',
  'Checking the map',
  'Outrunning a Nazgûl',
  'Lacing up the boots',
  'Asking Gandalf for directions',
  'Eating lembas bread',
];

export function pickRandomLoadingPhrase(): string {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}
