import { Theme } from '../../styles/themes';

const INACTIVE_BUTTON_COLOR = '#3f3f3f';

export type ButtonVariant =
  | 'primary'
  | 'primaryInverted'
  | 'inactive'
  | 'brand'
  | 'outline'
  | 'transparent';

/**
 * Get text/icon color for a button variant
 */
export function getButtonTextColor(
  theme: Theme,
  variant: ButtonVariant,
): string {
  'worklet';
  switch (variant) {
    case 'brand':
      return theme.colors.buttonBrandText;
    case 'outline':
    case 'primaryInverted':
      return theme.colors.buttonOutlineText;
    case 'inactive':
      return theme.colors.buttonPrimaryText;
    case 'transparent':
      return theme.colors.textPrimary;
    case 'primary':
    default:
      return theme.colors.buttonPrimaryText;
  }
}

/**
 * Get background color for a button variant
 */
export function getButtonBackgroundColor(
  theme: Theme,
  variant: ButtonVariant,
): string {
  'worklet';
  switch (variant) {
    case 'transparent':
      return 'transparent';
    case 'outline':
    case 'primaryInverted':
      return theme.colors.buttonOutlineBg;
    case 'inactive':
      return INACTIVE_BUTTON_COLOR;
    case 'brand':
      return theme.colors.buttonBrandBackground;
    case 'primary':
    default:
      return theme.colors.buttonPrimaryBackground;
  }
}

/**
 * Get border color for a button variant
 */
export function getButtonBorderColor(
  theme: Theme,
  variant: ButtonVariant,
): string {
  'worklet';
  if (variant === 'outline') return theme.colors.buttonOutlineBorder;
  if (variant === 'inactive') return INACTIVE_BUTTON_COLOR;
  return 'transparent';
}
