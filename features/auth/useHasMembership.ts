// Whether the signed-in user has been let into the app (has an `app_members`
// row). AuthGate uses this to decide between routing to the invite screen vs
// onward to onboarding/tabs.
//
// This mirrors useHasProfile.ts deliberately: same query shape, same enabled
// guard, so the two gate inputs behave identically while loading. Membership
// is granted by the auth.users trigger at signup (code redeemed) or by
// redeem_invite() from the invite screen — never by the client writing a row.

import { useQuery } from '@tanstack/react-query';
import { fetchHasMembership } from '../invites/api';
import { useSession } from './SessionProvider';

export function hasMembershipQueryKey(userId: string | undefined) {
  return ['membership', userId] as const;
}

export function useHasMembership() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: hasMembershipQueryKey(userId),
    queryFn: () => fetchHasMembership(userId as string),
    enabled: !!userId,
  });
}
