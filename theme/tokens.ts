// Design tokens for Comp Matcher — a warm, vintage-swing-dance palette.

export const colors = {
  // Core surfaces
  navy: '#1B2430', // deep navy, primary background / text on light surfaces
  charcoal: '#2A2A28', // secondary dark surface
  cream: '#F6F1E7', // warm off-white background
  creamDark: '#EAE1CD', // subtle contrast surface (cards on cream bg)

  // Accents
  brass: '#C7972C', // brass/gold accent — primary actions, highlights
  brassDark: '#A87A1E', // pressed/active state for brass
  red: '#8C3B2E', // muted red — destructive actions

  // Text
  textPrimary: '#1B2430',
  textSecondary: '#5B5750',
  textInverse: '#F6F1E7',

  // Utility
  border: '#D8CBAE',
  white: '#FFFFFF',
  black: '#000000',
  disabled: '#B9B2A0',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const tokens = {
  colors,
  spacing,
  radii,
  fontSizes,
  fontWeights,
} as const;

export type Tokens = typeof tokens;
