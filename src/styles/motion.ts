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
    duration: 4000,
  },

  // Modal animations
  modal: {
    entranceDelay: 200,
    entranceDuration: 300,
    exitDuration: 150,
    translateDistanceDefault: -24, // use 0 for fade-only modals
  },

  // Checkpoint celebration baseline timings (used by CelebrationBorder)
  checkpointCelebration: {
    maxRunMs: 3000,
    fadeOutDuration: 600,
    startStaggerMax: 900,
    fallDurationMin: 2500,
    fallDurationMax: 5000,
    pieceCount: 75,
    fadeOutBufferMs: 120,
    // Horizontal sway tuning
    swayAmplitudeMin: 6,
    swayAmplitudeMax: 12,
    swayCyclesMin: 2,
    swayCyclesMax: 3,
  },

  // Easing presets used across animations
  easing: {
    standard: Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.cubic),
    // Reverse of inOut: fast start, slow middle, fast end
    outIn: Easing.bezier(0.8, 0, 0.2, 1),
    linear: Easing.linear,
    sway: Easing.inOut(Easing.sin),
    // Snappier curve for small delta animations
    snappy: Easing.bezier(0.2, 0.8, 0.2, 1),
  },

  // Global motion-related feature flags
  flags: {
    checkpointCelebrationEnabled: true,
    // Debug/testing: allow celebration even if Reduce Motion is enabled
    // Keep false for production; toggle to true only for local diagnostics
    checkpointCelebrationIgnoreReduceMotion: false,
  },
} as const;
