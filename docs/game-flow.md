# Middle Earth Challenge – Game Flow & Animation Guide

This document outlines what users see based on their progress, how onboarding and checkpoints are orchestrated, and where animation timings are controlled.

## Overview

- The journey advances with accumulated miles (`TOTAL_JOURNEY_MILES`).
- Checkpoints and trivia entries are defined in JSON constants and shown contextually.
- Modals use fade-only or slide+fade animations driven by shared timing configuration.
  - InfoModal: fade-only when confetti will run; slide+fade when confetti will not run.

## Sources of Truth

- Settings & Theme: `src/stores/settingsStore.ts`
  - `showWelcome` controls onboarding visibility and animation lifecycle.
- Info Context: `src/stores/infoStore.ts`
  - `currentItem`, `itemType` (e.g., `checkpoint`, `trivia`) drive `InfoModal` content.
- Progress: `src/stores/progressStore.ts` (if present) and constants under `src/constants/`
  - Tracks journey progress, checkpoint completion, and derived percentages.
- Motion Config: `src/styles/motion.ts`
  - Centralized durations, delays, easing presets, and feature flags.

## Onboarding Sequence (new game)

Implemented via `src/hooks/useInitialAnimation.ts`:

1. When `showWelcome` is true:
   - Hide map path (`initialPathProgress = 0`) and buttons.
   - Reset origin and recenter button visibility.
2. On welcome dismissal (`showWelcome` becomes false):

   - Fade in Settings button (`motion.button.enterDuration`).
   - Fade in Labels after delay (`motion.button.enterDelayLabels`).
   - Reveal path (`motion.pathReveal.delay` + `motion.pathReveal.duration`).

   - New game:
     - Show Info button (checkpoint 1) after path reveal (`motion.modal.entranceDelay`).
     - Open checkpoint 1 after button reveal
   - User has walking data:
     - Show Info button if user clears a checkpoint while they were away (latest checkpoint) (`motion.modal.entranceDelay`).
     - If Info button is shown, open checkpoint modal for latest checkpoint after button reveal

## Welcome screen (new game)

1. CTA: Begin Journey

## Welcome screen (user has walking data)

1. CTA: Continue Journey
2. Progress bar: (A line showing progress to mount doom - like in checkpoint info modal)

## Checkpoint & Trivia Modal (InfoModal)

File: `src/components/InfoModal.tsx`

- Animation: Fade-only via `useAnimatedModal(visible, { translateDistance: 0 })`.
- Card background and shadow interpolate with content opacity to prevent artifacts.
- Dismissal: backdrop tap, close button, and `onRequestClose` call a local handler.
- Confetti: rendered when `itemType === 'checkpoint'` and if it is the user's latest checkpoint, if system Reduce Motion is OFF.
  - System Reduce Motion detection via `AccessibilityInfo`.
  - Timings sourced from `motion.confetti`.
  - Exclusions: no confetti for the first checkpoint (new game). Confetti only runs when the modal shows the user's latest unlocked checkpoint beyond checkpoint 1.

## Confetti

File: `src/components/Confetti.tsx`

- Piece count, fall duration, stagger, and fade-out sourced from `motion.confetti`.
- Easing: `motion.easing.standard/sway/linear`.
- Accessibility: if Reduce Motion is enabled (system), confetti does not render.

## Settings Modal

File: `src/components/SettingsModal.tsx` (if present)

- Animation: `useAnimatedModal` with slide+fade (default `translateDistance`).
- Shadow/background sync via the hook’s `contentOpacitySV`.

## Map Gestures & Recenter

File: `src/hooks/useMapGestures.ts`

- Pinch + pan with boundary clamping.
- Recenter action animates `scale`, `translateX`, `translateY` using `motion.easing.standard` and `motion.recenter.duration`.
- Recenter button opacity uses `motion.button.enterDuration/exitDuration`.

## Progress UI

File: `src/components/CheckpointInfo.tsx` and `src/components/InfoModal.tsx`

- Journey progress bar derives percentage from `TOTAL_JOURNEY_MILES` and current miles.
- Next checkpoint progress uses `checkpoints.json`; percentage wired to user progress.

## Motion Configuration

File: `src/styles/motion.ts`

- `button`: enter/exit durations and label delay.
- `recenter`: duration.
- `pathReveal`: delay + duration.
- `modal`: entrance delay/duration, exit duration, and default translate distance.
- `confetti`: max run, fade-out, stagger, min/max fall durations.
- `easing`: `standard`, `inOut`, `linear`, `sway` presets.
- `flags`: `confettiEnabled` (feature toggle).

## Reduce Motion Behavior

- Confetti is disabled when system Reduce Motion is ON (via `AccessibilityInfo`).
- Other animations continue unchanged unless explicitly updated.

## Key UX Rules

- InfoModal does not slide; fade-only to avoid layout shifts.
- Card shadow/background animate with content opacity to prevent flicker.
- Confetti never blocks taps (container `pointerEvents="none"`).
- Dismiss interactions do not re-open modals (hook manages `internalVisible`).

## Notes & Future Enhancements

- Consider documenting checkpoint unlocking criteria and trivia trigger points.
- If needed, add a diagram for onboarding → path reveal → first checkpoint flow.
- Optional: add a Debug section for motion tuning using `motion.ts`.
