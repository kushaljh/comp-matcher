// Session plumbing: subscribes to Supabase auth state and exposes it via
// context. This is the single source of truth AuthGate reacts to — sign-in,
// sign-up (when a session comes back immediately), and sign-out all flow
// through `supabase.auth.onAuthStateChange` and land here.

import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { queryClient } from '../../lib/queryClient';
import { supabase } from '../../lib/supabase';

type SessionContextValue = {
  session: Session | null;
  // True only until the initial getSession() resolves (or the first
  // onAuthStateChange event fires, whichever comes first). Never flips back
  // to true afterwards, so a sign-out later does not re-trigger a loading
  // splash.
  initializing: boolean;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
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

      // A sign-in, sign-out, or a token refresh that somehow carries a
      // different user all mean every previously-cached query result may
      // belong to the WRONG session's RLS-filtered view (e.g. an events
      // list fetched a moment too early, before this session was attached,
      // sitting in the cache as a stale empty result with nothing to ever
      // invalidate it). Clearing the whole shared cache — rather than just
      // marking it stale — also closes a privacy gap on shared devices:
      // sign-out must not leave the previous user's personal data (matches,
      // entries, profile-exists, ...) sitting in memory for whoever uses the
      // app next on the same device.
      const newUserId = newSession?.user.id ?? null;
      const userChanged = newUserId !== lastUserId.current;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && userChanged)) {
        queryClient.clear();
      }
      lastUserId.current = newUserId;

      setSession(newSession);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, initializing }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
