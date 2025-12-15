// Animation timing constants
// Centralized motion values for consistent animations across the app

export const motion = {
  // Button fade in/out animations
  button: {
    enterDuration: 220,
    exitDuration: 50,
    enterDelayLabels: 120,
  },

  // Map recenter animation
  recenter: {
    duration: 280,
  },

  // Path reveal animation (initial journey path drawing)
  pathReveal: {
    delay: 1000,
    duration: 2000,
  },

  // Modal animations
  modal: {
    entranceDelay: 200,
    entranceDuration: 300,
    exitDuration: 150,
  },
} as const;
