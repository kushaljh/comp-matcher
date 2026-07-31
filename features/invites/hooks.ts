// TanStack Query hooks for invites, in the shape of features/admin/hooks.ts.
//
// Mutations invalidate BOTH ['invites', 'mine'] and ['invites', 'remaining']
// because the quota is derived from the code list — minting or withdrawing a
// code changes the counter the Settings header shows.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider';
import * as api from './api';

export function useMyInvites() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['invites', 'mine', userId],
    queryFn: () => api.fetchMyInvites(userId as string),
    enabled: !!userId,
  });
}

/** -1 means unlimited (admins). */
export function useInvitesRemaining() {
  return useQuery({
    queryKey: ['invites', 'remaining'],
    queryFn: api.fetchInvitesRemaining,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.deleteInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}

// Redeeming flips the caller from "has a session but no membership" to "member",
// which is exactly what AuthGate keys on — so this invalidates the membership
// query (features/auth/useHasMembership.ts) and lets the gate move them on to
// onboarding.
export function useRedeemInvite() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: (code: string) => api.redeemInvite(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership', userId] });
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}

// --- admin ---------------------------------------------------------------

export function useAllInvites() {
  return useQuery({
    queryKey: ['invites', 'all'],
    queryFn: api.fetchAllInvites,
  });
}
