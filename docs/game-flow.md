# Middle Earth Challenge – Game Flow & Animation Guide

This document outlines what users see based on their progress, how onboarding and checkpoints are orchestrated, and where animation timings are controlled.

## Overview

- The journey advances with accumulated miles (`TOTAL_JOURNEY_MILES`).
- Checkpoints and trivia entries are defined in JSON constants and shown contextually.
- Modals use fade-only or slide+fade animations driven by shared timing configuration.
  - InfoModal: fade+slide per motion config; celebration effect does not alter overlay behavior.

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
- Celebration Border: animated multi-color gradient border is shown when `itemType === 'checkpoint'` and the modal is for the user's latest completed checkpoint (excluding the very first).
  - Accessibility: honors system Reduce Motion (rotation disabled; fades still apply).
  - Timings: duration sourced from `motion.checkpointCelebration.maxRunMs` (used to schedule border fade-out).
  - Behavior: the border sits above the modal and does not block taps.

## Celebration Border

File: `src/components/CelebrationBorder.tsx`

- Renders a full-screen rectangular stroke with a rotating linear gradient using a celebratory gold/white/yellow palette.
- Animation via Reanimated: gradient rotation with `withRepeat` and timed fade in/out.
- Accessibility: respects system Reduce Motion by disabling rotation while keeping fade.

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
- `checkpointCelebration`: celebration timing (`maxRunMs`) used by the border.
- `easing`: `standard`, `inOut`, `linear`, `sway` presets.
- `flags`: `checkpointCelebrationEnabled` (feature toggle).

## Reduce Motion Behavior

- Celebration Border rotation is disabled when system Reduce Motion is ON (via `AccessibilityInfo`); fades remain.
- Other animations continue unchanged unless explicitly updated.

## Key UX Rules

- InfoModal does not slide; fade-only to avoid layout shifts.
- Card shadow/background animate with content opacity to prevent flicker.
- Celebration Border never blocks taps (`pointerEvents="none"`).
- Dismiss interactions do not re-open modals (hook manages `internalVisible`).

## Notes & Future Enhancements

- Consider documenting checkpoint unlocking criteria and trivia trigger points.
- If needed, add a diagram for onboarding → path reveal → first checkpoint flow.
- Optional: add a Debug section for motion tuning using `motion.ts`.
