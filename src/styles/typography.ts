import { TextStyle } from 'react-native';
import type { Theme } from './themes';
import { shadows } from './global';

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
    fontWeight: 'bold',
  },
  titleMedium: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitleLarge: {
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
  },
  buttonLarge: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonMedium: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  button: {
    fontSize: 12,
    fontWeight: '600',
  },
};

// Themed typography helper for cases where color should be defined by theme
export const typographyThemed = (theme: Theme) => ({
  ...typography,
  // Themed large title/subtitle for inverted (overlay) surfaces
  titleMediumInverted: {
    ...typography.titleMedium,
    color: theme.colors.textInverted,
    textAlign: 'center',
    ...shadows.text,
  } as TextStyle,
  titleLargeInverted: {
    ...typography.titleLarge,
    color: theme.colors.textInverted,
    textAlign: 'center',
    ...shadows.text,
  } as TextStyle,
  subtitleLargeInverted: {
    ...typography.subtitleLarge,
    color: theme.colors.textInverted,
    textAlign: 'center',
    ...shadows.text,
  } as TextStyle,
  // Common text color helpers for primary surfaces
  titleMediumPrimary: {
    ...typography.titleMedium,
    color: theme.colors.textPrimary,
    textAlign: 'left',
  } as TextStyle,
  subtitleLargePrimary: {
    ...typography.subtitleLarge,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  } as TextStyle,
  bodyPrimary: {
    ...typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'left',
  } as TextStyle,
  bodySecondary: {
    ...typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'left',
  } as TextStyle,
  captionPrimary: {
    ...typography.caption,
    color: theme.colors.textPrimary,
    textAlign: 'left',
  } as TextStyle,
  captionPrimaryBold: {
    ...typography.caption,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'left',
  } as TextStyle,
  captionSecondary: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'left',
  } as TextStyle,
});
