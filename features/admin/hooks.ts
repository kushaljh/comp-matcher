// TanStack Query hooks for the admin panel feature.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import * as api from './api';

export function useIsAdmin() {
  return useQuery({
    queryKey: ['admin', 'isAdmin'],
    queryFn: api.fetchIsAdmin,
  });
}

export function useAdminPendingEvents() {
  return useQuery({
    queryKey: ['admin', 'events', 'pending'],
    queryFn: api.fetchPendingEvents,
  });
}

export function useAdminApprovedEvents() {
  return useQuery({
    queryKey: ['admin', 'events', 'approved'],
    queryFn: api.fetchApprovedEvents,
  });
}

// Approve/reject also invalidate ['events', 'approved'] — the EXACT query key
// features/events/hooks.ts's useApprovedEvents() uses — so the public Events
// tab reflects an approval/rejection immediately without its own refetch logic.
export function useApproveEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.approveEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'approved'] });
      queryClient.invalidateQueries({ queryKey: ['events', 'approved'] });
    },
  });
}

export function useRejectEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.rejectEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'events', 'pending'] });
    },
  });
}

export function useAdminDancers() {
  return useQuery({
    queryKey: ['admin', 'dancers'],
    queryFn: api.fetchDancers,
  });
}

// Suspending changes who the decks deal and what the Season counts, so this
// invalidates those caches too — the same prefixes features/events and
// features/swipe key on. Without it an admin would suspend someone and still
// see them on their own floor until an unrelated refetch.
export function useSetSuspended() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { profileId: string; suspended: boolean; reason?: string | null }) =>
      api.setSuspended(vars.profileId, vars.suspended, vars.reason),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'dancers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'actions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['swipe', 'deck'] });
      queryClient.invalidateQueries({ queryKey: ['swipe', 'passed'] });
      queryClient.invalidateQueries({ queryKey: ['entries', 'pool'] });
    },
  });
}

// The roster with the invite trail — what the Admin tab's Dancers page reads.
export function useAdminRoster() {
  return useQuery({
    queryKey: ['admin', 'roster'],
    queryFn: api.fetchDancerRoster,
  });
}

// Contact handles for ONE dancer, fetched only once their details are open —
// `enabled` is the point of this hook, not an optimisation. See the note on
// fetchDancerContacts().
export function useAdminDancerContacts(profileId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'contacts', profileId],
    queryFn: () => api.fetchDancerContacts(profileId),
    enabled,
  });
}

// Granting invites changes what that member sees in Settings, so this also
// invalidates the ['invites', ...] keys features/invites/hooks.ts uses. That
// only matters when an admin edits their own quota, but getting it wrong
// would leave them staring at a stale "0 left".
export function useSetInviteQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { profileId: string; quota: number }) =>
      api.setInviteQuota(vars.profileId, vars.quota),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'actions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: api.fetchOverview,
  });
}

export function useAdminActions(subjectUserId?: string) {
  return useQuery({
    queryKey: ['admin', 'actions', subjectUserId ?? 'all'],
    queryFn: () => api.fetchAdminActions(subjectUserId),
  });
}

export function useAdminFeedback() {
  return useQuery({
    queryKey: ['admin', 'feedback'],
    queryFn: api.fetchFeedback,
  });
}

// Resolving moves two other numbers: the landing page's feedback_new count and
// the admin log, which the RPC writes to. Both are invalidated here so the
// panel doesn't leave a stale "3 new" behind it.
export function useSetFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: Enums<'feedback_status'> }) =>
      api.setFeedbackStatus(vars.id, vars.status),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'actions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminContestsForEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'contests', 'byEvent', eventId],
    queryFn: () => api.fetchContestsForEvent(eventId as string),
    enabled: !!eventId,
  });
}

// Add/delete also invalidate ['contests', 'byEvent', eventId] — the EXACT
// query key features/events/hooks.ts's useContestsForEvent() uses — so the
// event detail screen (app/(tabs)/events/[id].tsx) picks up the change too.
export function useAddContest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; divisions: Enums<'division'>[] }) =>
      api.addContest({ eventId, name: vars.name, divisions: vars.divisions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'contests', 'byEvent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['contests', 'byEvent', eventId] });
    },
  });
}

export function useDeleteContest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contestId: string) => api.deleteContest(contestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'contests', 'byEvent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['contests', 'byEvent', eventId] });
    },
  });
}
