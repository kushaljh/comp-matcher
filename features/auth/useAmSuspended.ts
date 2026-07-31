// Whether the signed-in dancer has been suspended by an admin.
//
// Kept separate from useHasProfile rather than folded into it: that hook
// returns a bare boolean that onboarding writes optimistically
// (queryClient.setQueryData(hasProfileQueryKey(...), true)), and widening its
// shape would put an auth-critical path at risk for one extra cached column.
//
// This is only a nicety. RLS is what actually stops a suspended dancer doing
// anything — see 20260728220000_suspend_users.sql. Without this they would just
// find an app where every deck is empty and every swipe silently fails, with no
// idea why.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSession } from './SessionProvider';

export function suspendedQueryKey(userId: string | undefined) {
  return ['profile-suspended', userId] as const;
}

export function useAmSuspended() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: suspendedQueryKey(userId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('suspended_at')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.suspended_at ?? null;
    },
    enabled: !!userId,
  });
}
