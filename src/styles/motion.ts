// Animation timing constants
// Centralized motion values for consistent animations across the app
import { Easing } from 'react-native-reanimated';

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
    translateDistanceDefault: -24, // use 0 for fade-only modals
  },

  // Confetti baseline timings
  confetti: {
    maxRunMs: 3000,
    fadeOutDuration: 600,
    startStaggerMax: 900,
    fallDurationMin: 2500,
    fallDurationMax: 5000,
  },

  // Easing presets used across animations
  easing: {
    standard: Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.cubic),
    linear: Easing.linear,
    sway: Easing.inOut(Easing.sin),
    // Snappier curve for small delta animations
    snappy: Easing.bezier(0.2, 0.8, 0.2, 1),
  },

  // Global motion-related feature flags
  flags: {
    confettiEnabled: true,
  },
} as const;
