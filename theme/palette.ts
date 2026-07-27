// Art-deco "supper club" palettes, lifted verbatim from the design file's
// THEMES map. `dark` is the house style; `light` is the daytime variant.
//
// Colour roles (same key set in both palettes):
//   bg         page background
//   surface    raised card / sheet
//   surface2   secondary raised surface (chips, wells)
//   photoBg    placeholder behind photography
//   ink        primary text
//   ink2       secondary / muted text
//   brass      accent — primary actions, active states
//   brassLight brass hover / emphasis
//   red        destructive
//   line       hairline rule (low-contrast brass)
//   cardLine   card border (stronger brass hairline)
//   scrim      photo-to-text gradient base / modal backdrop
//   likeBg     tinted brass wash behind active items
//   fieldBg    input / inset well background
//   fan        the radiating fan motif tint

export type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  photoBg: string;
  ink: string;
  ink2: string;
  brass: string;
  brassLight: string;
  red: string;
  line: string;
  cardLine: string;
  scrim: string;
  likeBg: string;
  fieldBg: string;
  fan: string;
};

export type ResolvedMode = 'light' | 'dark';

export const palettes: Record<ResolvedMode, ThemeColors> = {
  dark: {
    bg: '#150C0E',
    surface: '#23131A',
    surface2: '#2E1A21',
    photoBg: '#33191F',
    ink: '#FBF3E2',
    ink2: '#B39B7E',
    brass: '#E9B23C',
    brassLight: '#FFD277',
    red: '#C4453A',
    line: 'rgba(233,178,60,.19)',
    cardLine: 'rgba(233,178,60,.34)',
    scrim: 'rgba(15,7,9,.97)',
    likeBg: 'rgba(233,178,60,.17)',
    fieldBg: 'rgba(251,243,226,.04)',
    fan: 'rgba(233,178,60,.1)',
  },
  light: {
    bg: '#F3EADA',
    surface: '#FFFBF1',
    surface2: '#EFE3CE',
    photoBg: '#3A2229',
    ink: '#20140F',
    ink2: '#6E5D4C',
    brass: '#9A6B12',
    brassLight: '#B98420',
    red: '#9E3427',
    line: 'rgba(154,107,18,.24)',
    cardLine: 'rgba(154,107,18,.36)',
    scrim: 'rgba(15,7,9,.94)',
    likeBg: 'rgba(154,107,18,.12)',
    fieldBg: 'rgba(32,20,15,.035)',
    fan: 'rgba(154,107,18,.09)',
  },
};

// Corner radii from the design (--r / --rSm), plus the pill used by every
// button and chip.
export const radii = {
  r: 24,
  rSm: 16,
  pill: 999,
} as const;

export type ThemeRadii = typeof radii;
