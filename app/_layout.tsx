import 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { ReactNode, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthGate } from '../features/auth/AuthGate';
import { SessionProvider } from '../features/auth/SessionProvider';
import { queryClient } from '../lib/queryClient';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

/**
 * Feeds our palette to react-navigation, which paints the bits we don't render
 * ourselves — scene backgrounds and any nested stack header. Without this they
 * stay on the library's light default and show through as pale gray.
 */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { colors, resolvedMode } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = resolvedMode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: resolvedMode === 'dark',
      colors: {
        ...base.colors,
        primary: colors.brass,
        background: colors.bg,
        card: colors.bg,
        text: colors.ink,
        border: colors.line,
        notification: colors.red,
      },
    };
  }, [colors, resolvedMode]);

  return <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        {/* Above SessionProvider so it never remounts when the auth state
            flips — a remount would re-run font loading and prefs hydration
            and flash the app back to the holding screen. */}
        <ThemeProvider>
          <ThemedNavigation>
            <SessionProvider>
              <AuthGate>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(auth)" />
                </Stack>
              </AuthGate>
            </SessionProvider>
          </ThemedNavigation>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
