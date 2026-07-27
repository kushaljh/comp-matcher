// TanStack Query hooks for the events feature.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import * as api from './api';

export function useApprovedEvents() {
  return useQuery({
    queryKey: ['events', 'approved'],
    queryFn: api.fetchApprovedEvents,
  });
}

export function useMyProfileId() {
  return useQuery({
    queryKey: ['myProfileId'],
    queryFn: api.fetchMyProfileId,
    staleTime: Infinity,
  });
}

// One query per event, keyed exactly like features/admin/hooks.ts's
// useAdminContestsForEvent (['contests', 'byEvent', eventId]) — that hook's
// add/delete-contest mutations invalidate that same key, so an admin change
// reaches The Season too. useQueries (not a hook-per-item loop) is what makes
// a dynamic-length list of these safe to call.
export function useContestsForEvents(eventIds: string[]) {
  return useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ['contests', 'byEvent', eventId] as const,
      queryFn: () => api.fetchContestsForEvent(eventId),
    })),
  });
}

// One query per contest — every entrant (id, division, profile_id), which
// doubles as both "is it me, and what's my division" and the division pool
// counts shown on the chips.
export function useEntriesForContests(contestIds: string[]) {
  return useQueries({
    queries: contestIds.map((contestId) => ({
      queryKey: ['entries', 'byContest', contestId] as const,
      queryFn: () => api.fetchEntriesForContest(contestId),
    })),
  });
}

// Division chips enter/change an entry directly (no separate join screen).
// vars.contestId is only along for cache invalidation.
export function useJoinContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { profileId: string; contestId: string; division: Enums<'division'> }) =>
      api.joinContest({ profileId: vars.profileId, contestId: vars.contestId, division: vars.division, note: null }),
    // Refetch on settle (success OR error) — a 23505 unique-violation race means
    // someone/something already created the row, so the true state after any
    // outcome is "check what's there now" rather than trusting local state.
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'byContest', vars.contestId] });
    },
  });
}

export function useUpdateEntryDivision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; contestId: string; division: Enums<'division'> }) =>
      api.updateEntryDivision(vars.entryId, vars.division),
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'byContest', vars.contestId] });
    },
  });
}

export function useLeaveContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; contestId: string }) => api.leaveContest(vars.entryId),
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['entries', 'byContest', vars.contestId] });
    },
  });
}

export function useSuggestEvent() {
  return useMutation({
    mutationFn: api.suggestEvent,
  });
}
