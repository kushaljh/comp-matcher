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
