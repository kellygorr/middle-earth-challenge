import { StyleSheet } from 'react-native';
import { spacing, shadows } from './global';

/**
 * Shared styles for modal components.
 * These provide consistent layout and appearance across all modals.
 */
export const modalStyles = StyleSheet.create({
  // Overlay that covers the screen behind the modal
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },

  // SafeAreaView container
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Main content wrapper with max-width constraint
  contentWrapper: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    paddingVertical: spacing.sm,
  },

  // Portrait mode: title above modal
  title: {
    marginBottom: spacing.sm,
  },

  // Horizontal layout for landscape mode (title on left + modal card)
  horizontalLayout: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  // Landscape mode: vertical title container on left side
  verticalTitleContainer: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Landscape mode: rotated title text
  verticalTitle: {
    transform: [{ rotate: '-90deg' }],
    width: 200,
    textAlign: 'center',
  },

  // Modal card container
  modalContainer: {
    flex: 1,
    borderRadius: 16,
    ...shadows.large,
    paddingTop: 48, // Space for header buttons
  },

  // Modal card with smaller header (no left button)
  modalContainerSmallHeader: {
    paddingTop: 40,
  },

  // Default card background (animated separately)
  modalCardDefault: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },

  // ScrollView inside modal
  scrollView: {
    flex: 1,
  },

  // ScrollView content padding
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },

  // Header button container (right side - close button)
  closeButton: {
    position: 'absolute',
    top: 0,
    right: spacing.sm,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  // Header button container (left side - optional home/back button)
  leftButton: {
    position: 'absolute',
    top: 0,
    left: spacing.sm,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  // Section container with bottom margin
  section: {
    marginBottom: spacing.xl,
  },

  // Section title
  sectionTitle: {
    marginBottom: spacing.md,
  },
});

/**
 * Style constants for modal dimensions and calculations
 */
export const modalConstants = {
  // Percentage of safe area height for modal in portrait mode
  portraitHeightRatio: 0.8,
  // Max width for modal content
  maxWidth: 540,
  // Narrower max width for info-style modals
  maxWidthNarrow: 440,
  // Header height with both left and right buttons
  headerHeightLarge: 64,
  // Header height with only close button
  headerHeightSmall: 48,
};
