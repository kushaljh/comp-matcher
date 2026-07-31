import 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { Fragment, ReactNode, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthGate } from '../features/auth/AuthGate';
import { SessionProvider } from '../features/auth/SessionProvider';
import { BackstageGate, wantsBackstage } from '../features/maintenance/backstage';
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
  // The backstage door: ?backstage=1 (web) mounts the real app during
  // maintenance so an ADMIN can sign in — BackstageGate below walls off
  // everyone else after auth. Captured once per mount so client-side
  // navigation can't flip it mid-session.
  const [backstage] = useState(wantsBackstage);

  // Maintenance mode short-circuits the whole app: no router, no
  // SessionProvider, no react-query — so every URL lands on the holding
  // screen and the client makes no Supabase calls at all while we're down.
  // ThemeProvider stays so the screen paints in the real palette and faces.
  // Nothing below navigates, so the router never needing to mount is safe.
  if (MAINTENANCE_MODE && !backstage) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <MaintenanceScreen />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // During maintenance-with-backstage, the gate sits inside AuthGate so the
  // normal sign-in flow works; outside maintenance it disappears entirely.
  const Gate = MAINTENANCE_MODE ? BackstageGate : Fragment;

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
                <Gate>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="(auth)" />
                  </Stack>
                </Gate>
              </AuthGate>
            </SessionProvider>
          </ThemedNavigation>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
