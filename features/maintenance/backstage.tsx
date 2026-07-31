// The backstage door: an admin override for maintenance mode.
//
// Maintenance mode short-circuits the whole app at build time, so this check
// runs at RUNTIME, before the short-circuit: opening any URL with
// `?backstage=1` (web only) mounts the real app instead of the holding
// screen. That is deliberately NOT a secret — the URL only unlocks the LOGIN.
// Once signed in, BackstageGate asks `admin_users` (RLS: a user can only read
// their own row) and:
//   - admins get the full app;
//   - everyone else gets the maintenance screen right back.
// So a leaked backstage URL grants a non-admin nothing but a sign-in form,
// and data access remains exactly what RLS always enforces.
//
// The flag persists in sessionStorage so client-side navigation and reloads
// within the tab keep the door open; closing the tab closes the door.

import { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { useIsAdmin } from '../admin/hooks';
import { useSession } from '../auth/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { MaintenanceScreen } from './MaintenanceScreen';

const STORAGE_KEY = 'cm-backstage';

/** True when this tab asked for the backstage door (web only). */
export function wantsBackstage(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('backstage')) {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Wraps the app tree during maintenance-with-backstage: signed-out users see
 * the normal auth screens (that's the point of the door), signed-in users are
 * admitted only if they are admins.
 */
export function BackstageGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { colors } = useTheme();
  const isAdminQuery = useIsAdmin();

  // No session yet: let the auth screens render so the admin can sign in.
  if (!session) return <>{children}</>;

  // Signed in: hold a blank frame until the admin check answers, so a
  // non-admin never sees a flash of the real app.
  if (isAdminQuery.isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (!isAdminQuery.data) return <MaintenanceScreen />;

  return <>{children}</>;
}
