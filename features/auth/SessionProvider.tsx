// Session plumbing: subscribes to Supabase auth state and exposes it via
// context. This is the single source of truth AuthGate reacts to — sign-in,
// sign-up (when a session comes back immediately), and sign-out all flow
// through `supabase.auth.onAuthStateChange` and land here.

import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { queryClient } from '../../lib/queryClient';
import { startedInPasswordRecovery, supabase } from '../../lib/supabase';

type SessionContextValue = {
  session: Session | null;
  // True only until the initial getSession() resolves (or the first
  // onAuthStateChange event fires, whichever comes first). Never flips back
  // to true afterwards, so a sign-out later does not re-trigger a loading
  // splash.
  initializing: boolean;
  // True between clicking an emailed recovery link and actually setting a new
  // password. A recovery link attaches a REAL session, so without this flag the
  // gate cannot tell "just reset my password" apart from "signed in normally"
  // and drops the user into the tabs with nothing reset.
  recovering: boolean;
  /** Called by the reset screen once the new password is saved. */
  endRecovery: () => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Seeded from the URL captured at module load, NOT just from the
  // PASSWORD_RECOVERY event: on web that event fires while supabase-js is being
  // constructed, before this component exists to hear it. The listener below
  // still matters for native, where the deep-link handler triggers it later.
  const [recovering, setRecovering] = useState(startedInPasswordRecovery);
  // Tracks the user id the cache was last cleared for, so a same-user token
  // refresh (which fires every ~hour and is NOT an identity change) doesn't
  // trigger a needless clear.
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      lastUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      // Clear the shared query cache ONLY when the signed-in identity actually
      // changes (null→user on sign-in, user→null on sign-out, user→other).
      // That covers the stale-anonymous-cache bug (queries fired before the
      // session attached, cached as an empty RLS-filtered result) and the
      // shared-device privacy gap (sign-out must not leave the previous
      // user's matches/entries in memory for the next user).
      //
      // Crucially, supabase-js re-emits SIGNED_IN for the SAME user every time
      // the tab regains focus — clearing unconditionally on SIGNED_IN made
      // every navigate-away-and-back cold-reload the whole app.
      const newUserId = newSession?.user.id ?? null;
      const userChanged = newUserId !== lastUserId.current;
      if (event === 'SIGNED_OUT' || ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && userChanged)) {
        queryClient.clear();
      }
      lastUserId.current = newUserId;

      // supabase-js raises PASSWORD_RECOVERY once it has consumed a recovery
      // token (from the URL hash on web, or from setSession on native).
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);

      setSession(newSession);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Native recovery links. On web `detectSessionInUrl` consumes the token from
  // the hash automatically (see lib/supabase.ts); native has no such hook, so
  // the tokens are pulled off the incoming deep link and set by hand. Doing so
  // makes supabase-js emit PASSWORD_RECOVERY, which the listener above catches,
  // so both platforms converge on the same flag.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const consume = async (url: string | null) => {
      if (!url || !url.includes('access_token')) return;
      // Supabase returns the tokens in the URL *fragment*.
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (params.get('type') !== 'recovery' || !access_token || !refresh_token) return;
      await supabase.auth.setSession({ access_token, refresh_token });
      setRecovering(true);
    };

    // Cold start (app opened by the link) and warm (already running).
    Linking.getInitialURL().then(consume);
    const sub = Linking.addEventListener('url', ({ url }) => consume(url));
    return () => sub.remove();
  }, []);

  const endRecovery = useCallback(() => setRecovering(false), []);

  return (
    <SessionContext.Provider value={{ session, initializing, recovering, endRecovery }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
