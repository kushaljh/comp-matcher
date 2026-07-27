// Data layer for the swipe feature: TanStack Query hooks + the swipe-write
// helpers. Everything goes through the anon supabase client so RLS applies.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type {
  CompetitionHistoryRow,
  DeckCard,
  MatchFace,
  MyEntry,
} from './types';

// ---------------------------------------------------------------------------
// The caller's own profile id (null when signed out / no profile yet).
// ---------------------------------------------------------------------------
export function useMyProfileId() {
  return useQuery({
    queryKey: ['swipe', 'myProfileId'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('get_my_profile_id');
      if (error) throw error;
      return data ?? null;
    },
  });
}

// ---------------------------------------------------------------------------
// The caller's own profile face (for the "It's a match!" overlay).
// ---------------------------------------------------------------------------
export function useMyFace(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['swipe', 'myFace', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<MatchFace> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, photo_url')
        .eq('id', profileId!)
        .single();
      if (error) throw error;
      return { displayName: data.display_name, photoUrl: data.photo_url };
    },
  });
}

// ---------------------------------------------------------------------------
// The caller's contest entries, flattened for the picker.
// ---------------------------------------------------------------------------
export function useMyEntries(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['swipe', 'myEntries', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<MyEntry[]> => {
      const { data, error } = await supabase
        .from('entries')
        .select('id, division, contest_id, contests!inner(name, events!inner(name))')
        .eq('profile_id', profileId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        entryId: row.id,
        contestId: row.contest_id,
        division: row.division,
        contestName: row.contests.name,
        eventName: row.contests.events.name,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// The swipeable deck for a contest (server-filtered by role/division/history).
// ---------------------------------------------------------------------------
export function useDeck(contestId: string | null | undefined) {
  return useQuery({
    queryKey: ['swipe', 'deck', contestId],
    enabled: !!contestId,
    // Always fetch fresh candidates when we ask (contest change / screen focus).
    staleTime: 0,
    queryFn: async (): Promise<DeckCard[]> => {
      const { data, error } = await supabase.rpc('get_deck', {
        p_contest_id: contestId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Competition history for every candidate in the deck, in ONE query, grouped
// by profile_id. Keyed on the sorted profile-id list so it re-fetches when the
// deck's membership changes but not on every re-render.
// ---------------------------------------------------------------------------
export function useDeckHistory(profileIds: string[]) {
  const key = [...profileIds].sort();
  return useQuery({
    queryKey: ['swipe', 'deckHistory', key],
    enabled: profileIds.length > 0,
    queryFn: async (): Promise<Record<string, CompetitionHistoryRow[]>> => {
      const { data, error } = await supabase
        .from('competition_history')
        .select('*')
        .in('profile_id', profileIds)
        .order('year', { ascending: false });
      if (error) throw error;
      const byProfile: Record<string, CompetitionHistoryRow[]> = {};
      for (const row of data ?? []) {
        (byProfile[row.profile_id] ??= []).push(row);
      }
      return byProfile;
    },
  });
}

// ---------------------------------------------------------------------------
// Write helpers (called imperatively from the deck, not via useMutation, so the
// deck keeps a single code path for optimistic add/remove around the animation).
// ---------------------------------------------------------------------------

// Persist a swipe. Throws on failure so the caller can roll the card back.
export async function insertSwipe(input: {
  contestId: string;
  swiperProfileId: string;
  targetProfileId: string;
  direction: 'like' | 'pass';
}): Promise<void> {
  const { error } = await supabase.from('swipes').insert({
    contest_id: input.contestId,
    swiper_profile_id: input.swiperProfileId,
    target_profile_id: input.targetProfileId,
    direction: input.direction,
  });
  if (error) throw error;
}

// After a like, the DB trigger has already created the match row (same txn) if
// the target liked back. Look it up by the canonically-ordered pair.
export async function findMatch(input: {
  contestId: string;
  me: string;
  target: string;
}): Promise<boolean> {
  const [profileA, profileB] =
    input.me < input.target ? [input.me, input.target] : [input.target, input.me];
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('contest_id', input.contestId)
    .eq('profile_a', profileA)
    .eq('profile_b', profileB)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
