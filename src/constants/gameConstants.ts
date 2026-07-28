// Game-specific constants and configuration values

export const TOTAL_JOURNEY_MILES = 1235;

// SVG map viewBox dimensions (source of truth for scaling)
export const SVG_WIDTH = 3059.47;
export const SVG_HEIGHT = 2350.67;

/**
 * Save id used across the app. The multi-save feature isn't shipped
 * yet, so every row (settings, distance entries, progress snapshot)
 * is scoped to this single id. Exported as a constant so a future
 * multi-save switch has a single search target rather than 30+
 * scattered `'default'` string literals.
 */
export const DEFAULT_SAVE_ID = 'default';
