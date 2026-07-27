// TanStack Query hooks for the events feature.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import * as api from './api';

export function useApprovedEvents() {
  return useQuery({
    queryKey: ['events', 'approved'],
    queryFn: api.fetchApprovedEvents,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['events', id],
    queryFn: () => api.fetchEvent(id as string),
    enabled: !!id,
  });
}

export function useContestsForEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['contests', 'byEvent', eventId],
    queryFn: () => api.fetchContestsForEvent(eventId as string),
    enabled: !!eventId,
  });
}

export function useMyProfileId() {
  return useQuery({
    queryKey: ['myProfileId'],
    queryFn: api.fetchMyProfileId,
    staleTime: Infinity,
  });
}

export function useMyEntry(contestId: string, profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['entries', 'mine', contestId, profileId],
    queryFn: () => api.fetchMyEntry(contestId, profileId as string),
    enabled: !!contestId && !!profileId,
  });
}

export function useJoinContest(contestId: string, profileId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { division: Enums<'division'>; note: string | null }) =>
      api.joinContest({ profileId: profileId as string, contestId, division: vars.division, note: vars.note }),
    // Refetch on settle (success OR error) — a 23505 unique-violation race means
    // someone/something already created the row, so the true state after any
    // outcome is "check what's there now" rather than trusting local state.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'mine', contestId, profileId] });
    },
  });
}

export function useUpdateEntryNote(contestId: string, profileId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; note: string | null }) => api.updateEntryNote(vars.entryId, vars.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'mine', contestId, profileId] });
    },
  });
}

export function useLeaveContest(contestId: string, profileId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => api.leaveContest(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'mine', contestId, profileId] });
    },
  });
}

export function useSuggestEvent() {
  return useMutation({
    mutationFn: api.suggestEvent,
  });
}
