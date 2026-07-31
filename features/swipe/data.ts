// Data layer for the swipe feature: TanStack Query hooks + the swipe-write
// helpers. Everything goes through the anon supabase client so RLS applies.
import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type {
  CompetitionHistoryRow,
  DanceRole,
  DeckCard,
  MyEntry,
  MyProfileFace,
} from './types';

// Query keys the deck mutates imperatively (swipe / undo), exported so the
// invalidations stay in lock-step with the hooks below.
//
// Keyed on ENTRY, not contest: a dancer may hold two entries in one contest
// (one per role), and those are two independent decks with separate swipe
// histories. Keying on contestId would collapse them into one cache slot.
export const deckKey = (entryId: string) => ['swipe', 'deck', entryId];
export const passedKey = (entryId: string) => ['swipe', 'passed', entryId];
export const statsKey = (contestId: string, profileId: string, role: DanceRole) => [
  'swipe',
  'stats',
  contestId,
  profileId,
  role,
];

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
// The caller's own face. Role used to live here, but a dancer no longer HAS a
// role — each entry does — so the role now travels with the selected entry.
// ---------------------------------------------------------------------------
export function useMyFace(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['swipe', 'myFace', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<MyProfileFace> => {
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
// The caller's contest entries, flattened for the picker. A dancer entered in
// one contest as BOTH roles gets two rows here — two stubs, two decks.
// ---------------------------------------------------------------------------
export function useMyEntries(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['swipe', 'myEntries', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<MyEntry[]> => {
      const { data, error } = await supabase
        .from('entries')
        .select('id, division, role, contest_id, contests!inner(name, events!inner(name))')
        .eq('profile_id', profileId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        entryId: row.id,
        contestId: row.contest_id,
        division: row.division,
        role: row.role,
        contestName: row.contests.name,
        eventName: row.contests.events.name,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// The swipeable deck for ONE entry (server-filtered by role/division/history).
// The entry id — not the contest id — is what identifies a deck now.
// ---------------------------------------------------------------------------
async function fetchDeck(entryId: string): Promise<DeckCard[]> {
  const { data, error } = await supabase.rpc('get_deck', { p_entry_id: entryId });
  if (error) throw error;
  return data ?? [];
}

export function useDeck(entryId: string | null | undefined) {
  return useQuery({
    queryKey: deckKey(entryId ?? ''),
    enabled: !!entryId,
    // Always fetch fresh candidates when we ask (entry change / screen focus).
    staleTime: 0,
    queryFn: () => fetchDeck(entryId!),
  });
}

// ---------------------------------------------------------------------------
// The dancers this entry has PASSED on — get_deck's query with the swipe test
// inverted, so the cards come back in the same shape. Only fetched when the
// floor is cleared, which is the one place it's shown.
// ---------------------------------------------------------------------------
export function usePassed(entryId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: passedKey(entryId ?? ''),
    enabled: enabled && !!entryId,
    // Same reasoning as the deck: taking someone back has to be reflected the
    // next time this is asked for, not up to a minute later.
    staleTime: 0,
    queryFn: async (): Promise<DeckCard[]> => {
      const { data, error } = await supabase.rpc('get_passed', { p_entry_id: entryId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// "N on the floor" for every ticket stub. Deliberately shares useDeck's cache
// key, so the stubs cost one RPC per entry and selecting a stub is then an
// instant cache hit rather than a second fetch.
// ---------------------------------------------------------------------------
export function useDeckCounts(entryIds: string[]): Record<string, number> {
  return useQueries({
    queries: entryIds.map((id) => ({
      queryKey: deckKey(id),
      staleTime: 0,
      queryFn: () => fetchDeck(id),
    })),
    combine: (results) => {
      const counts: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.data) counts[entryIds[i]] = r.data.length;
      });
      return counts;
    },
  });
}

// ---------------------------------------------------------------------------
// Right-rail tallies for one contest: how many dancers the caller has asked,
// and how many pairings came back. Both are RLS-scoped to the caller already;
// the explicit filters just make that visible at the call site.
// ---------------------------------------------------------------------------
// Both tallies are scoped to the ROLE being danced, not just the contest —
// otherwise a dancer entered in both roles would see their leader and follower
// numbers added together on whichever stub happened to be selected.
export function useContestStats(
  contestId: string | null | undefined,
  profileId: string | null | undefined,
  role: DanceRole | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: statsKey(contestId ?? '', profileId ?? '', role ?? 'leader'),
    enabled: enabled && !!contestId && !!profileId && !!role,
    queryFn: async (): Promise<{ asked: number; paired: number }> => {
      const asked = await supabase
        .from('swipes')
        .select('id', { count: 'exact', head: true })
        .eq('contest_id', contestId!)
        .eq('swiper_profile_id', profileId!)
        .eq('swiper_role', role!)
        .eq('direction', 'like');
      if (asked.error) throw asked.error;
      // profile_a_role is stored from a's side, so being profile_b means the
      // caller's role is the inverse of what the row records.
      const other: DanceRole = role === 'leader' ? 'follower' : 'leader';
      const paired = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('contest_id', contestId!)
        .or(
          `and(profile_a.eq.${profileId},profile_a_role.eq.${role}),` +
            `and(profile_b.eq.${profileId},profile_a_role.eq.${other})`
        );
      if (paired.error) throw paired.error;
      return { asked: asked.count ?? 0, paired: paired.count ?? 0 };
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
// `myRole` is the role the caller is competing as — the swipes_insert policy
// checks they actually hold an entry at that role.
export async function insertSwipe(input: {
  contestId: string;
  swiperProfileId: string;
  swiperRole: DanceRole;
  targetProfileId: string;
  direction: 'like' | 'pass';
}): Promise<void> {
  const { error } = await supabase.from('swipes').insert({
    contest_id: input.contestId,
    swiper_profile_id: input.swiperProfileId,
    swiper_role: input.swiperRole,
    target_profile_id: input.targetProfileId,
    direction: input.direction,
  });
  if (error) throw error;
}

// Take back a pass. The `swipes_delete_own_pass` policy allows exactly this and
// nothing else: your own row, direction 'pass'. The direction filter is repeated
// client-side so a stale undo stack can never aim this at a like; the role
// filter keeps an undo on one deck from clearing the other deck's pass.
export async function deleteOwnPass(input: {
  contestId: string;
  swiperProfileId: string;
  swiperRole: DanceRole;
  targetProfileId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('contest_id', input.contestId)
    .eq('swiper_profile_id', input.swiperProfileId)
    .eq('swiper_role', input.swiperRole)
    .eq('target_profile_id', input.targetProfileId)
    .eq('direction', 'pass');
  if (error) throw error;
}

// After a like, the DB trigger has already created the match row (same txn) if
// the target liked back. Look it up by the canonically-ordered pair plus the
// role — the same two dancers can hold a second, separate match in this contest
// with the roles reversed.
export async function findMatch(input: {
  contestId: string;
  me: string;
  myRole: DanceRole;
  target: string;
}): Promise<boolean> {
  const iAmA = input.me < input.target;
  const [profileA, profileB] = iAmA ? [input.me, input.target] : [input.target, input.me];
  const aRole: DanceRole = iAmA
    ? input.myRole
    : input.myRole === 'leader'
      ? 'follower'
      : 'leader';
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('contest_id', input.contestId)
    .eq('profile_a', profileA)
    .eq('profile_b', profileB)
    .eq('profile_a_role', aRole)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
