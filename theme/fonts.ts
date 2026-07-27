// Typography for the supper-club system. The design leans on five families:
//   Limelight            — the marquee (app title, headline moments)
//   Poiret One           — deco numerals (years, big stats)
//   DM Serif Display     — names and card headlines
//   Barlow               — body copy
//   Barlow Semi Condensed— buttons, chips, nav labels (uppercase + tracked)
// plus a platform monospace for the micro-caption / label voice.

import { Platform } from 'react-native';
import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import {
  BarlowSemiCondensed_500Medium,
  BarlowSemiCondensed_600SemiBold,
} from '@expo-google-fonts/barlow-semi-condensed';
import { DMSerifDisplay_400Regular, DMSerifDisplay_400Regular_Italic } from '@expo-google-fonts/dm-serif-display';
import { Limelight_400Regular } from '@expo-google-fonts/limelight';
import { PoiretOne_400Regular } from '@expo-google-fonts/poiret-one';

// Passed to useFonts() in ThemeProvider. Keys become the fontFamily names.
export const fontAssets = {
  Limelight_400Regular,
  PoiretOne_400Regular,
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  BarlowSemiCondensed_500Medium,
  BarlowSemiCondensed_600SemiBold,
};

export const fonts = {
  display: 'Limelight_400Regular',
  deco: 'PoiretOne_400Regular',
  serif: 'DMSerifDisplay_400Regular',
  serifItalic: 'DMSerifDisplay_400Regular_Italic',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
  bodyBold: 'Barlow_700Bold',
  condensed: 'BarlowSemiCondensed_500Medium',
  condensedSemi: 'BarlowSemiCondensed_600SemiBold',
  // No mono is bundled — use what each platform already has. On web a CSS
  // font stack is legal as a fontFamily; on native it must be a single face.
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, Menlo, monospace',
  }) as string,
} as const;

export type Fonts = typeof fonts;
