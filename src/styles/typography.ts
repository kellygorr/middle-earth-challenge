import { TextStyle } from 'react-native';
import type { Theme } from './themes';
import { shadows } from './global';
import { useSettingsStore } from '../stores/settingsStore';

export interface Typography {
  titleLarge: TextStyle;
  titleMedium: TextStyle;
  subtitleLarge: TextStyle;
  body: TextStyle;
  caption: TextStyle;
  buttonLarge: TextStyle;
  buttonMedium: TextStyle;
  button: TextStyle;
}

export const typography: Typography = {
  titleLarge: {
    fontSize: 36,
    lineHeight: 62,
    fontWeight: 'bold',
  },
  titleMedium: {
    fontSize: 24,
    lineHeight: 41,
    fontWeight: 'bold',
  },
  subtitleLarge: {
    fontSize: 20,
    lineHeight: 35,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 28,
    fontWeight: '400',
  },
  caption: {
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '400',
  },
  buttonLarge: {
    fontSize: 18,
    lineHeight: 31,
    fontWeight: 'bold',
  },
  buttonMedium: {
    fontSize: 14,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  button: {
    fontSize: 12,
    lineHeight: 21,
    fontWeight: '600',
  },
};

// Themed typography helper. Reads the current Text size preference and
// applies a global font-size multiplier so every modal/screen scales
// together. On-map text chips bypass this (they go through Button with
// `isLabelButton`, which uses the unscaled base `typography` tokens).
export const typographyThemed = (theme: Theme) => {
  const scale = textSizeScale[useSettingsStore.getState().textSize];
  const s = (style: TextStyle): TextStyle => scaleTextStyle(style, scale);
  return {
    titleLarge: s(typography.titleLarge),
    titleMedium: s(typography.titleMedium),
    subtitleLarge: s(typography.subtitleLarge),
    body: s(typography.body),
    caption: s(typography.caption),
    buttonLarge: s(typography.buttonLarge),
    buttonMedium: s(typography.buttonMedium),
    button: s(typography.button),
    // Themed large title/subtitle for inverted (overlay) surfaces
    titleMediumInverted: s({
      ...typography.titleMedium,
      color: theme.colors.textInverted,
      textAlign: 'center',
      ...shadows.text,
    }) as TextStyle,
    titleLargeInverted: s({
      ...typography.titleLarge,
      color: theme.colors.textInverted,
      textAlign: 'center',
      ...shadows.text,
    }) as TextStyle,
    subtitleLargeInverted: s({
      ...typography.subtitleLarge,
      color: theme.colors.textInverted,
      textAlign: 'center',
      ...shadows.text,
    }) as TextStyle,
    // Common text color helpers for primary surfaces
    titleMediumPrimary: s({
      ...typography.titleMedium,
      color: theme.colors.textPrimary,
      textAlign: 'left',
    }) as TextStyle,
    subtitleLargePrimary: s({
      ...typography.subtitleLarge,
      color: theme.colors.textPrimary,
      textAlign: 'center',
    }) as TextStyle,
    bodyPrimary: s({
      ...typography.body,
      color: theme.colors.textPrimary,
      textAlign: 'left',
    }) as TextStyle,
    bodySecondary: s({
      ...typography.body,
      color: theme.colors.textSecondary,
      textAlign: 'left',
    }) as TextStyle,
    captionPrimary: s({
      ...typography.caption,
      color: theme.colors.textPrimary,
      textAlign: 'left',
    }) as TextStyle,
    captionPrimaryBold: s({
      ...typography.caption,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      textAlign: 'left',
    }) as TextStyle,
    captionSecondary: s({
      ...typography.caption,
      color: theme.colors.textSecondary,
      textAlign: 'left',
    }) as TextStyle,
    captionSecondaryBold: s({
      ...typography.caption,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'left',
    }) as TextStyle,
    captionInverted: s({
      ...typography.caption,
      color: theme.colors.textInverted,
      textAlign: 'left',
    }) as TextStyle,
  };
};

// Global text-size multipliers. On-map labels bypass this via Button's
// `isLabelButton` prop (which uses the unscaled base `typography` tokens).
export const textSizeScale = {
  small: 0.875,
  medium: 1,
  large: 1.15,
} as const;

export function scaleTextStyle(style: TextStyle, scale: number): TextStyle {
  if (scale === 1 || typeof style.fontSize !== 'number') return style;
  return { ...style, fontSize: Math.round(style.fontSize * scale) };
}
