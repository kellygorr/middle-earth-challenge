export interface Theme {
  name: string;
  colors: {
    // Map styling
    mapBackground: string;
    mapBackgroundInverted: string;
    mapDefaultColor: string;

    // Path colors
    pathInactive: string;
    pathProgress: string;
    pathGlow: string;

    // Checkpoint markers
    checkpointLocked: string;
    checkpointUnlocked: string;
    checkpointLabel: string;
    checkpointLabelInactive: string;
    checkpointTextBackground: string;
    infoModalInactive: string;

    // Trivia markers
    triviaLocked: string;

    // UI colors
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    uiStepIncrease: string;
    uiWarning: string;
    uiBadgeInProgress: string;
    uiBadgeSuccessBackground: string;
    uiBadgeSuccessBorder: string;
    uiBadgeSuccessText: string;
    uiBadgeNeutralBackground: string;
    uiBadgeNeutralText: string;
    progressBarActive: string;
    divider: string;

    // Icon colors
    iconPrimary: string;
    iconInverted: string;

    // Splash colors
    splashBackground: string;
    splashErrorBackground: string;
    splashText: string;
    splashTextSecondary: string;
    splashBorder: string;

    // Text colors
    textPrimary: string;
    textSecondary: string;
    textInverted: string;
    textOnSurface: string;

    // Modal/Celebration colors
    modalBackground: string;
    modalOverlay: string;
    modalOverlay2: string;
    celebrationAccent: string;
    modalHeaderText: string;
    modalCelebrationGold: string;

    // Button colors
    buttonPrimary: string;
    // Switch colors
    switchInactive: string;
    // Button variant-specific tokens
    buttonPrimaryBackground: string;
    buttonPrimaryText: string;
    buttonBrandBackground: string;
    buttonBrandText: string;
    buttonOutlineBg: string;
    buttonOutlineBorder: string;
    buttonOutlineText: string;
    // Disabled state
    buttonDisabledBg: string;
    buttonDisabledText: string;
    // Pressed state
    buttonPressed: string;
    buttonPressedInverted: string;
    // Success state
    successBg: string;
    successBorder: string;
    successText: string;
    // Empty state
    emptyStateBg: string;
    emptyStateText: string;

    // SVG layer colors (for colorized map mode)
    svgLegend: string;
    svgTitles: string;
    svgTitlesReduced: string;
    svgTrees: string;
    svgMountains: string;
    svgStreets: string;
    svgWater: string;
    svgCoastline: string;
  };

  // Typography
  fonts: {
    regular: string;
    medium: string;
    bold: string;
    display: string;
  };
}

// Shared SVG layer colors (used by all themes, can be overridden per-theme)
const svgLayerColors = {
  svgLegend: '#231f20',
  svgTitles: '#2C1810',
  svgTitlesReduced: 'rgba(0, 0, 0, 0.3)',
  svgTrees: '#436e47ff',
  svgMountains: '#51402bff',
  svgStreets: '#B8956A',
  svgWater: '#5B8FA3',
  svgCoastline: '#2F4858',
};

// Classic Theme - Warm, parchment-inspired, Middle-earth aesthetic
export const classicTheme: Theme = {
  name: 'classic',
  colors: {
    // Map styling
    mapBackground: '#e6e2daff',
    mapBackgroundInverted: '#000000',
    mapDefaultColor: '#231f20',

    // Path colors
    pathInactive: '#afa99cff',
    pathProgress: '#8B4513',
    pathGlow: 'rgba(139, 69, 19, 0.3)',

    // Checkpoint markers
    checkpointLocked: '#afa99cff',
    triviaLocked: 'transparent',
    checkpointUnlocked: '#6a4c34ff',
    checkpointLabel: '#ffffff',
    checkpointLabelInactive: '#757575',
    checkpointTextBackground: '#000000',
    infoModalInactive: '#6e6e6eff',

    // UI colors
    background: '#F5EFE0',
    surface: '#EDE4D3',
    primary: '#6a4c34ff',
    secondary: '#A0826D',
    accent: '#6a4c34ff',
    uiStepIncrease: '#e9df7f',
    uiWarning: '#F4B400',
    uiBadgeInProgress: '#F5A623',
    uiBadgeSuccessBackground: '#E8EEE9',
    uiBadgeSuccessBorder: '#9FADA3',
    uiBadgeSuccessText: '#3F5947',
    uiBadgeNeutralBackground: '#F5EFE0',
    uiBadgeNeutralText: '#A0826D',
    progressBarActive: '#3f321fff',
    divider: 'rgba(0, 0, 0, 0.12)',

    // Icon colors
    iconPrimary: '#3f321fff',
    iconInverted: '#FFFFFF',

    // Splash colors
    splashBackground: '#000000',
    splashErrorBackground: '#101010',
    splashText: '#FFFFFF',
    splashTextSecondary: '#D0D0D0',
    splashBorder: '#FFFFFF',

    // Text colors
    textPrimary: '#3f321fff',
    textSecondary: '#5C4033',
    textInverted: '#F5EFE0',
    textOnSurface: '#2C1810',

    // Modal/Celebration colors
    modalBackground: '#e6e2daff',
    modalOverlay: 'rgba(53, 41, 28, 0.75)',
    modalOverlay2: 'rgba(53, 41, 28, 0.45)',
    celebrationAccent: '#6a4c34ff',
    modalHeaderText: '#FFFFFF',
    modalCelebrationGold: 'rgba(120, 94, 10, 0.75)',

    // Button colors
    buttonPrimary: '#543f30ff',
    // Switch colors
    switchInactive: '#A0826D',
    // Button variant-specific tokens
    buttonPrimaryBackground: '#3f321fff',
    buttonPrimaryText: '#FFFFFF',
    buttonBrandBackground: '#6a4c34ff',
    buttonBrandText: '#FFFFFF',
    buttonOutlineBg: '#FFFFFF',
    buttonOutlineBorder: '#6a4c34ff',
    buttonOutlineText: '#2f1b14ff',
    // Disabled state
    buttonDisabledBg: '#A0826D',
    buttonDisabledText: '#F5EFE0',
    // Pressed state
    buttonPressed: 'rgba(107, 89, 67, 1)',
    buttonPressedInverted: '#EBE3D2',
    // Success state
    successBg: '#E8EEE9',
    successBorder: '#9FADA3',
    successText: '#3F5947',
    // Empty state
    emptyStateBg: '#F5EFE0',
    emptyStateText: '#A0826D',

    // SVG layer colors
    ...svgLayerColors,
  },

  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    display: 'System',
  },
};

// Minimalist Theme - Clean, modern, simple aesthetic
export const minimalistTheme: Theme = {
  name: 'minimalist',
  colors: {
    // Map styling
    mapBackground: '#FFFFFF',
    mapBackgroundInverted: '#000000',
    mapDefaultColor: '#231f20',

    // Path colors
    pathInactive: '#c7c0b2ff',
    pathProgress: '#D4AF37',
    pathGlow: 'rgba(44, 62, 80, 0.2)',

    // Checkpoint markers
    checkpointLocked: '#c7c0b2ff',
    triviaLocked: 'transparent',
    checkpointUnlocked: '#D4AF37',
    checkpointLabel: '#ffffff',
    checkpointLabelInactive: '#757575',
    checkpointTextBackground: '#000000',
    infoModalInactive: '#6e6e6eff',

    // UI colors
    background: '#FAFAFA',
    surface: '#FFFFFF',
    primary: '#D4AF37',
    secondary: '#546E7A',
    accent: '#2C3E50',
    uiStepIncrease: '#e9df7f',
    uiWarning: '#F4B400',
    uiBadgeInProgress: '#F5A623',
    uiBadgeSuccessBackground: '#E8EEE9',
    uiBadgeSuccessBorder: '#9FADA3',
    uiBadgeSuccessText: '#3F5947',
    uiBadgeNeutralBackground: '#E0E0E0',
    uiBadgeNeutralText: '#757575',
    progressBarActive: '#D4AF37',
    divider: 'rgba(0, 0, 0, 0.12)',

    // Icon colors
    iconPrimary: '#212121',
    iconInverted: '#FFFFFF',

    // Splash colors
    splashBackground: '#000000',
    splashErrorBackground: '#101010',
    splashText: '#FFFFFF',
    splashTextSecondary: '#D0D0D0',
    splashBorder: '#FFFFFF',

    // Text colors
    textPrimary: '#212121',
    textSecondary: '#757575',
    textInverted: '#FFFFFF',
    textOnSurface: '#212121',

    // Modal/Celebration colors
    modalBackground: '#FFFFFF',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',
    modalOverlay2: 'rgba(0, 0, 0, 0.45)',
    celebrationAccent: '#D4AF37',
    modalHeaderText: '#FFFFFF',
    modalCelebrationGold: 'rgba(120, 94, 10, 0.75)',

    // Button colors
    buttonPrimary: '#D4AF37',
    // Switch colors
    switchInactive: '#E0E0E0',
    // Button variant-specific tokens
    buttonPrimaryBackground: '#000000',
    buttonPrimaryText: '#FFFFFF',
    buttonBrandBackground: '#D4AF37',
    buttonBrandText: '#000000',
    buttonOutlineBg: '#FFFFFF',
    buttonOutlineBorder: '#D4AF37',
    buttonOutlineText: '#212121',
    // Disabled state
    buttonDisabledBg: '#757575',
    buttonDisabledText: '#E0E0E0',
    // Pressed state
    buttonPressed: '#757575',
    buttonPressedInverted: '#EDEDED',
    // Success state
    successBg: '#E8EEE9',
    successBorder: '#9FADA3',
    successText: '#3F5947',
    // Empty state
    emptyStateBg: '#E0E0E0',
    emptyStateText: '#757575',

    // SVG layer colors
    ...svgLayerColors,
  },

  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    display: 'System',
  },
};

export const themes = {
  classic: classicTheme,
  minimalist: minimalistTheme,
};

export type ThemeName = keyof typeof themes;
