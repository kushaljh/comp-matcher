// BACK-COMPAT SHIM — do not add to this file.
//
// The app's visual system now lives in theme/ThemeProvider.tsx (useTheme()),
// which is themed (dark/light), text-scaled, and font-aware. This module keeps
// the OLD static token names alive so screens that haven't been converted yet
// still compile and render acceptably; every value is remapped onto the new
// DARK palette.
//
// Notable remappings (old name -> new role), because a few old names read
// backwards on a dark theme:
//   navy        -> bg        (was "the dark colour": text on brass, dark fills)
//   cream       -> bg        (was "the page background")
//   creamDark   -> surface   (was "card on the page")
//   white       -> surface   (was "the lightest surface")
//   brassDark   -> brassLight(the *emphasis* brass is the lighter one in dark)
//   textInverse -> ink       (every usage sits on a dark fill, so it must be light)
//   border      -> cardLine  (visible brass hairline)
//
// New screens: import { useTheme } from './ThemeProvider' instead.

import { palettes } from './palette';

const p = palettes.dark;

export const colors = {
  // Core surfaces
  navy: p.bg,
  charcoal: p.surface2,
  cream: p.bg,
  creamDark: p.surface,

  // Accents
  brass: p.brass,
  brassDark: p.brassLight,
  red: p.red,

  // Text
  textPrimary: p.ink,
  textSecondary: p.ink2,
  textInverse: p.ink,

  // Utility
  border: p.cardLine,
  white: p.surface,
  black: '#000000',
  disabled: '#6E5D4C',
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
