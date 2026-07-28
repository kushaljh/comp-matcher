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

// The partner pool for the contests currently on screen: how many dancers the
// given role would actually be DEALT in each division, straight from the same
// server-side rules as the deck. One query per (contest, role) — the Season
// only asks for the expanded event's contests, so this is a handful of calls
// rather than one per contest in the season.
//
// The role is part of the key: a dancer looking at their leader tab and their
// follower tab of the same contest is looking at two different pools.
export function usePoolCounts(pairs: { contestId: string; role: Enums<'dance_role'> }[]) {
  return useQueries({
    queries: pairs.map(({ contestId, role }) => ({
      queryKey: ['entries', 'pool', contestId, role] as const,
      queryFn: () => api.fetchPoolCounts(contestId, role),
    })),
  });
}

// Every entry mutation must invalidate ALL the caches that show "my entries",
// not just this feature's own — Your Card (['profile','entries']), the Floor's
// contest stubs (['swipe','myEntries']) and that contest's deck stay mounted
// in their tabs and would otherwise show the pre-mutation state until an
// unrelated refetch. Same set used by features/profile's leave mutation.
function invalidateEntryCaches(queryClient: ReturnType<typeof useQueryClient>, contestId: string) {
  queryClient.invalidateQueries({ queryKey: ['entries', 'byContest', contestId] });
  // Entering or leaving changes the caller's own division and role, which is
  // what the pool counts are computed relative to — and the whole prefix, not
  // just this contest, because the counts exclude anyone already paired with
  // and withdrawing dissolves pairings.
  queryClient.invalidateQueries({ queryKey: ['entries', 'pool'] });
  queryClient.invalidateQueries({ queryKey: ['profile', 'entries'] });
  queryClient.invalidateQueries({ queryKey: ['swipe', 'myEntries'] });
  // Deck caches are keyed by ENTRY id now, and one contest change can affect
  // either of the caller's two entries there — so invalidate the whole prefix
  // rather than trying to name the affected entry ids.
  queryClient.invalidateQueries({ queryKey: ['swipe', 'deck'] });
  // Withdrawing dissolves that contest's pairings (DB trigger) — the Dance
  // Card must drop them too.
  queryClient.invalidateQueries({ queryKey: ['matches'] });
}

// Division chips enter/change an entry directly (no separate join screen).
// vars.contestId is only along for cache invalidation.
export function useJoinContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      profileId: string;
      contestId: string;
      division: Enums<'division'>;
      role: Enums<'dance_role'>;
    }) =>
      api.joinContest({
        profileId: vars.profileId,
        contestId: vars.contestId,
        division: vars.division,
        role: vars.role,
        note: null,
      }),
    // Refetch on settle (success OR error) — a 23505 unique-violation race means
    // someone/something already created the row, so the true state after any
    // outcome is "check what's there now" rather than trusting local state.
    onSettled: (_data, _err, vars) => {
      invalidateEntryCaches(queryClient, vars.contestId);
    },
  });
}

export function useUpdateEntryDivision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; contestId: string; division: Enums<'division'> }) =>
      api.updateEntryDivision(vars.entryId, vars.division),
    onSettled: (_data, _err, vars) => {
      invalidateEntryCaches(queryClient, vars.contestId);
    },
  });
}

export function useLeaveContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; contestId: string }) => api.leaveContest(vars.entryId),
    onSettled: (_data, _err, vars) => {
      invalidateEntryCaches(queryClient, vars.contestId);
    },
  });
}

export function useSuggestEvent() {
  return useMutation({
    mutationFn: api.suggestEvent,
  });
}
