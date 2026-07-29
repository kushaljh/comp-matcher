import 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { ReactNode, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthGate } from '../features/auth/AuthGate';
import { SessionProvider } from '../features/auth/SessionProvider';
import { MAINTENANCE_MODE } from '../features/maintenance/config';
import { MaintenanceScreen } from '../features/maintenance/MaintenanceScreen';
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
  // Maintenance mode short-circuits the whole app: no router, no
  // SessionProvider, no react-query — so every URL lands on the holding
  // screen and the client makes no Supabase calls at all while we're down.
  // ThemeProvider stays so the screen paints in the real palette and faces.
  // Nothing below navigates, so the router never needing to mount is safe.
  if (MAINTENANCE_MODE) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <MaintenanceScreen />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

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
