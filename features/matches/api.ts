// Data access for the Matches feature: matches list (grouped by event) and
// match detail (other dancer's profile, their entry in the match's contest,
// competition history, and contact list revealed by the match).
import { supabase } from '../../lib/supabase';
import type { Enums } from '../../lib/database.types';

export type MatchListItem = {
  id: string;
  contestId: string;
  contestName: string;
  eventId: string;
  eventName: string;
  otherProfile: {
    id: string;
    displayName: string;
    photoUrl: string | null;
  };
};

export type MatchDetail = {
  id: string;
  contestId: string;
  contestName: string;
  eventName: string;
  otherProfile: {
    id: string;
    displayName: string;
    photoUrl: string | null;
    role: Enums<'dance_role'>;
    bio: string | null;
    values: string[];
  };
};

export type OtherEntry = {
  division: Enums<'division'>;
  note: string | null;
};

export type ContactRow = {
  id: string;
  platform: Enums<'contact_platform'>;
  handle: string;
};

export type HistoryRow = {
  id: string;
  eventName: string;
  year: number;
  contestName: string;
  placement: string | null;
};

// Raw shapes returned by the embedded selects below. supabase-js's template
// literal typing for nested foreign-table selects (with `!fkey` hints) is
// unreliable across versions, so we type the response by hand and cast once.
type RawProfileLite = {
  id: string;
  display_name: string;
  photo_url: string | null;
};

type RawMatchListRow = {
  id: string;
  contest_id: string;
  profile_a: string;
  profile_b: string;
  contest: { id: string; name: string; event: { id: string; name: string } | null } | null;
  profile_a_data: RawProfileLite | null;
  profile_b_data: RawProfileLite | null;
};

type RawProfileFull = RawProfileLite & {
  role: Enums<'dance_role'>;
  bio: string | null;
  values: string[];
};

type RawMatchDetailRow = {
  id: string;
  contest_id: string;
  profile_a: string;
  profile_b: string;
  contest: { name: string; event: { name: string } | null } | null;
  profile_a_data: RawProfileFull | null;
  profile_b_data: RawProfileFull | null;
};

export async function fetchMyProfileId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_profile_id');
  if (error) throw error;
  return data ?? null;
}

export async function fetchMatches(myProfileId: string): Promise<MatchListItem[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      id,
      contest_id,
      profile_a,
      profile_b,
      contest:contests(id, name, event:events(id, name)),
      profile_a_data:profiles!matches_profile_a_fkey(id, display_name, photo_url),
      profile_b_data:profiles!matches_profile_b_fkey(id, display_name, photo_url)
    `
    )
    .or(`profile_a.eq.${myProfileId},profile_b.eq.${myProfileId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as RawMatchListRow[];
  return rows.map((row) => {
    const isA = row.profile_a === myProfileId;
    const other = isA ? row.profile_b_data : row.profile_a_data;
    return {
      id: row.id,
      contestId: row.contest_id,
      contestName: row.contest?.name ?? 'Unknown contest',
      eventId: row.contest?.event?.id ?? '',
      eventName: row.contest?.event?.name ?? 'Unknown event',
      otherProfile: {
        id: other?.id ?? '',
        displayName: other?.display_name ?? 'Dancer',
        photoUrl: other?.photo_url ?? null,
      },
    };
  });
}

export async function fetchMatchDetail(
  matchId: string,
  myProfileId: string
): Promise<MatchDetail | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      id,
      contest_id,
      profile_a,
      profile_b,
      contest:contests(name, event:events(name)),
      profile_a_data:profiles!matches_profile_a_fkey(id, display_name, photo_url, role, bio, values),
      profile_b_data:profiles!matches_profile_b_fkey(id, display_name, photo_url, role, bio, values)
    `
    )
    .eq('id', matchId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawMatchDetailRow;
  const isA = row.profile_a === myProfileId;
  const other = isA ? row.profile_b_data : row.profile_a_data;
  if (!other) return null;

  return {
    id: row.id,
    contestId: row.contest_id,
    contestName: row.contest?.name ?? 'Unknown contest',
    eventName: row.contest?.event?.name ?? 'Unknown event',
    otherProfile: {
      id: other.id,
      displayName: other.display_name,
      photoUrl: other.photo_url,
      role: other.role,
      bio: other.bio,
      values: other.values ?? [],
    },
  };
}

export async function fetchOtherEntry(
  profileId: string,
  contestId: string
): Promise<OtherEntry | null> {
  const { data, error } = await supabase
    .from('entries')
    .select('division, note')
    .eq('profile_id', profileId)
    .eq('contest_id', contestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchOtherContacts(profileId: string): Promise<ContactRow[]> {
  const { data, error } = await supabase
    .from('profile_contacts')
    .select('id, platform, handle')
    .eq('profile_id', profileId)
    .order('platform');
  if (error) throw error;
  return data ?? [];
}

export async function fetchOtherHistory(profileId: string): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from('competition_history')
    .select('id, event_name, year, contest_name, placement')
    .eq('profile_id', profileId)
    .order('year', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((h) => ({
    id: h.id,
    eventName: h.event_name,
    year: h.year,
    contestName: h.contest_name,
    placement: h.placement,
  }));
}
