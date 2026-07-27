// Session plumbing: subscribes to Supabase auth state and exposes it via
// context. This is the single source of truth AuthGate reacts to — sign-in,
// sign-up (when a session comes back immediately), and sign-out all flow
// through `supabase.auth.onAuthStateChange` and land here.

import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
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
