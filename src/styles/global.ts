// Spacing scale for consistent margins, padding, and gaps
export const spacing = {
  // Smallest step — tight padding for compact chips/badges where even
  // `xs` (4) reads as too loose (e.g. the small StatusBadge variant).
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xl2: 40,
  xxl: 48,
  xxxl: 64,
} as const;

// Border radius values
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// Button chrome tokens. Two `type`s share a `size` axis but index different
// padding & radius scales:
// - `regular` — standard chrome for modals/controls. Adds an `xs` size for
//   tight inline controls like segmented selectors.
// - `label` — tighter chrome for on-map text chips (checkpoint names) so they
//   never visually collide with regular buttons.
export const buttonTokens = {
  padding: {
    regular: {
      xs: { vertical: 4, horizontal: 12 },
      small: { vertical: 8, horizontal: 8 },
      default: { vertical: 8, horizontal: 16 },
      large: { vertical: 8, horizontal: 8 },
    },
    label: {
      small: { vertical: 2, horizontal: 6 },
      default: { vertical: 2, horizontal: 4 },
      large: { vertical: 4, horizontal: 6 },
    },
  },
  radius: {
    regular: {
      xs: 6,
      small: 8,
      default: 8,
      large: 8,
    },
    label: {
      small: 4,
      default: 6,
      large: 6,
    },
  },
} as const;

// Shadow styles for views and text
export const shadows = {
  small: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  large: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  text: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
} as const;

// Standardized icon sizes
export const iconSizes = {
  small: 20,
  medium: 24,
  large: 32,
  xlarge: 40,
} as const;

// Standardized touch target sizes for icon buttons
export const iconButtonSizes = {
  small: 40, // aligns with recommended 40-44
  medium: 48, // close to previous 50
  large: 56,
} as const;

// Scroll container styles for modals and lists
export const scrollStyles = {
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
} as const;
