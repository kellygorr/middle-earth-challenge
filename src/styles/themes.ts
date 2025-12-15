export interface Theme {
  name: string;
  colors: {
    // Map styling
    mapBackground: string;
    mapDefaultColor: string;

    // Path colors
    pathGrey: string;
    pathProgress: string;
    pathGlow: string;

    // Checkpoint markers
    checkpointLocked: string;
    checkpointUnlocked: string;
    checkpointLabel: string;
    checkpointLabelInactive: string;
    checkpointTextBackground: string;

    // Trivia markers
    triviaLocked: string;
    triviaUnlocked: string;
    triviaBorder: string;

    // UI colors
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;

    // Text colors
    textPrimary: string;
    textSecondary: string;
    textOnPrimary: string;
    textOnSurface: string;

    // Modal/Celebration colors
    modalBackground: string;
    modalOverlay: string;
    celebrationAccent: string;

    // Button colors
    buttonPrimary: string;
    buttonInactive: string;
    buttonText: string;

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
    mapDefaultColor: '#231f20',

    // Path colors
    pathGrey: '#A0826D',
    pathProgress: '#8B4513',
    pathGlow: 'rgba(139, 69, 19, 0.3)',

    // Checkpoint markers
    checkpointLocked: '#A0826D',
    checkpointUnlocked: '#D4AF37',
    checkpointLabel: '#ffffff',
    checkpointLabelInactive: '#757575',
    checkpointTextBackground: '#000000',

    // Trivia markers
    triviaLocked: '#8B7355',
    triviaUnlocked: '#CD7F32',
    triviaBorder: '#5C4033',

    // UI colors
    background: '#F5EFE0',
    surface: '#EDE4D3',
    primary: '#8B4513',
    secondary: '#A0826D',
    accent: '#D4AF37',

    // Text colors
    textPrimary: '#2C1810',
    textSecondary: '#5C4033',
    textOnPrimary: '#F5EFE0',
    textOnSurface: '#2C1810',

    // Modal/Celebration colors
    modalBackground: '#e6e2daff',
    modalOverlay: 'rgba(53, 41, 28, 0.75)',
    celebrationAccent: '#D4AF37',

    // Button colors
    buttonPrimary: '#543f30ff',
    buttonInactive: '#A0826D',
    buttonText: '#F5EFE0',

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
    mapDefaultColor: '#231f20',

    // Path colors
    pathGrey: '#B0BEC5',
    pathProgress: '#2C3E50',
    pathGlow: 'rgba(44, 62, 80, 0.2)',

    // Checkpoint markers
    checkpointLocked: '#B0BEC5',
    checkpointUnlocked: '#D4AF37',
    checkpointLabel: '#ffffff',
    checkpointLabelInactive: '#757575',
    checkpointTextBackground: '#000000',

    // Trivia markers
    triviaLocked: '#CFD8DC',
    triviaUnlocked: '#CD7F32',
    triviaBorder: '#A66829',

    // UI colors
    background: '#FAFAFA',
    surface: '#FFFFFF',
    primary: '#D4AF37',
    secondary: '#546E7A',
    accent: '#2C3E50',

    // Text colors
    textPrimary: '#212121',
    textSecondary: '#757575',
    textOnPrimary: '#FFFFFF',
    textOnSurface: '#212121',

    // Modal/Celebration colors
    modalBackground: '#FFFFFF',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',
    celebrationAccent: '#D4AF37',

    // Button colors
    buttonPrimary: '#D4AF37',
    buttonInactive: '#E0E0E0',
    buttonText: '#000000',

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
