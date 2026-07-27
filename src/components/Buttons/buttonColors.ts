import { Theme } from '../../styles/themes';

export type ButtonVariant =
  | 'primary'
  | 'primaryInverted'
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
  return variant === 'outline'
    ? theme.colors.buttonOutlineBorder
    : 'transparent';
}
