// Whether the signed-in user has completed onboarding (has a `profiles` row).
// AuthGate uses this to decide between routing to onboarding vs the tabs.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSession } from './SessionProvider';

export function hasProfileQueryKey(userId: string | undefined) {
  return ['profile-exists', userId] as const;
}

export function useHasProfile() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: hasProfileQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    enabled: !!userId,
  });
}
