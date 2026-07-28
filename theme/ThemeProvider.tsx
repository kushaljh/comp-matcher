// The themed design system. Everything visual reads from useTheme():
// palette, radii, font families, a text-scale helper, and the three user
// preferences (appearance / text size / motion) that the Settings screen owns.
//
// Preferences persist in AsyncStorage under a single key and hydrate on mount.
// Render is held (blank themed screen) until BOTH the fonts and the stored
// preferences are ready, so nothing paints in a fallback font or the wrong
// palette and then snaps.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { fontAssets, fonts, type Fonts } from './fonts';
import { palettes, radii, type ResolvedMode, type ThemeColors, type ThemeRadii } from './palette';

export type ThemeMode = 'system' | 'light' | 'dark';

/** The four steps the Settings screen offers. Any number works at runtime. */
export const TEXT_SCALES = [0.9, 1, 1.12, 1.25] as const;

export type ThemeValue = {
  colors: ThemeColors;
  radii: ThemeRadii;
  fonts: Fonts;
  /** Multiply a design px size by the user's text scale. */
  fs: (size: number) => number;
  textScale: number;
  reduceMotion: boolean;
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  setMode: (mode: ThemeMode) => void;
  setTextScale: (scale: number) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
};

type Prefs = {
  mode: ThemeMode;
  textScale: number;
  reduceMotion: boolean;
};

const PREFS_KEY = 'compmatcher.prefs.v1';

const DEFAULT_PREFS: Prefs = { mode: 'system', textScale: 1, reduceMotion: false };

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [fontsLoaded] = useFonts(fontAssets);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const stored = JSON.parse(raw) as Partial<Prefs>;
        setPrefs((prev) => ({ ...prev, ...stored }));
      })
      .catch(() => {
        // A corrupt or unreadable prefs blob is not worth failing boot over.
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Write-back. Skipped until hydration finishes so the defaults never
  // overwrite what was stored.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefs, hydrated]);

  // The design defaults to the dark room when the device has no preference.
  const resolvedMode: ResolvedMode =
    prefs.mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : prefs.mode;

  // Web only: the design's thin brass scrollbars. RN has no scrollbar styling
  // primitive, so inject the CSS globally and re-inject when the palette flips
  // (the thumb colour follows the resolved theme's brass).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const brass = palettes[resolvedMode].brass;
    const id = 'cm-scrollbars';
    let tag = document.getElementById(id) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = id;
      document.head.appendChild(tag);
    }
    tag.textContent = `
      * { scrollbar-width: thin; scrollbar-color: ${brass}6B transparent; }
      *::-webkit-scrollbar { width: 9px; height: 9px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb {
        background: ${brass}57;
        border: 3px solid transparent;
        background-clip: content-box;
        border-radius: 999px;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: ${brass}B3;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      *::-webkit-scrollbar-corner { background: transparent; }
    `;
  }, [resolvedMode]);

  const value = useMemo<ThemeValue>(
    () => ({
      colors: palettes[resolvedMode],
      radii,
      fonts,
      fs: (size: number) => Math.round(size * prefs.textScale * 100) / 100,
      textScale: prefs.textScale,
      reduceMotion: prefs.reduceMotion,
      mode: prefs.mode,
      resolvedMode,
      setMode: (mode) => setPrefs((prev) => ({ ...prev, mode })),
      setTextScale: (textScale) => setPrefs((prev) => ({ ...prev, textScale })),
      setReduceMotion: (reduceMotion) => setPrefs((prev) => ({ ...prev, reduceMotion })),
    }),
    [resolvedMode, prefs.textScale, prefs.reduceMotion, prefs.mode]
  );

  if (!fontsLoaded || !hydrated) {
    return <View style={{ flex: 1, backgroundColor: palettes[resolvedMode].bg }} />;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
