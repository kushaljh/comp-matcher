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
  createdAt: string;
  division: Enums<'division'> | null;
  /** The caller's role in this pairing; the other dancer's is the opposite. */
  myRole: Enums<'dance_role'>;
  otherRole: Enums<'dance_role'>;
  firstHandle: string | null;
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
  createdAt: string;
  myRole: Enums<'dance_role'>;
  otherProfile: {
    id: string;
    displayName: string;
    photoUrl: string | null;
    /** Role in THIS pairing — a dancer has no single role any more. */
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
  profile_a_role: Enums<'dance_role'>;
  profile_b: string;
  created_at: string;
  contest: { id: string; name: string; event: { id: string; name: string } | null } | null;
  profile_a_data: RawProfileLite | null;
  profile_b_data: RawProfileLite | null;
};

type RawProfileFull = RawProfileLite & {
  bio: string | null;
  values: string[];
};

type RawMatchDetailRow = {
  id: string;
  contest_id: string;
  profile_a: string;
  profile_a_role: Enums<'dance_role'>;
  profile_b: string;
  created_at: string;
  contest: { name: string; event: { name: string } | null } | null;
  profile_a_data: RawProfileFull | null;
  profile_b_data: RawProfileFull | null;
};

const otherRole = (r: Enums<'dance_role'>): Enums<'dance_role'> =>
  r === 'leader' ? 'follower' : 'leader';

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
      profile_a_role,
      profile_b,
      created_at,
      contest:contests(id, name, event:events(id, name)),
      profile_a_data:profiles!matches_profile_a_fkey(id, display_name, photo_url),
      profile_b_data:profiles!matches_profile_b_fkey(id, display_name, photo_url)
    `
    )
    .or(`profile_a.eq.${myProfileId},profile_b.eq.${myProfileId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as RawMatchListRow[];

  // The division shown per row is the SHARED entry division (get_deck() only
  // ever matches same-contest, same-division candidates). One bulk query for all
  // (contest_id, profile_id) pairs in the list beats N sequential lookups.
  //
  // The key includes ROLE: the other dancer may hold two entries in this
  // contest, and only the one at the role of THIS pairing has the right
  // division. Keying on (contest, profile) alone would let a leader entry's
  // division overwrite the follower entry's, at random.
  const otherIds = rows.map((row) => (row.profile_a === myProfileId ? row.profile_b : row.profile_a));
  const contestIds = rows.map((row) => row.contest_id);
  const divisionByKey = new Map<string, Enums<'division'>>();
  if (rows.length > 0) {
    const { data: entryRows, error: entryErr } = await supabase
      .from('entries')
      .select('contest_id, profile_id, division, role')
      .in('contest_id', contestIds)
      .in('profile_id', otherIds);
    if (entryErr) throw entryErr;
    for (const e of entryRows ?? []) {
      divisionByKey.set(`${e.contest_id}::${e.profile_id}::${e.role}`, e.division);
    }
  }

  // First contact handle per matched profile — readable because the RLS
  // policy on profile_contacts opens up once matched (see 20260727120100_rls.sql).
  const firstHandleByProfile = new Map<string, string>();
  if (otherIds.length > 0) {
    const { data: contactRows, error: contactErr } = await supabase
      .from('profile_contacts')
      .select('profile_id, handle')
      .in('profile_id', otherIds)
      .order('platform');
    if (contactErr) throw contactErr;
    for (const c of contactRows ?? []) {
      if (!firstHandleByProfile.has(c.profile_id)) firstHandleByProfile.set(c.profile_id, c.handle);
    }
  }

  return rows.map((row) => {
    const isA = row.profile_a === myProfileId;
    const other = isA ? row.profile_b_data : row.profile_a_data;
    const otherId = other?.id ?? '';
    // profile_a_role is recorded from a's side, so being profile_b means the
    // caller's role is the inverse of what the row stores.
    const myRole = isA ? row.profile_a_role : otherRole(row.profile_a_role);
    const theirRole = otherRole(myRole);
    return {
      id: row.id,
      contestId: row.contest_id,
      contestName: row.contest?.name ?? 'Unknown contest',
      eventId: row.contest?.event?.id ?? '',
      eventName: row.contest?.event?.name ?? 'Unknown event',
      createdAt: row.created_at,
      division: divisionByKey.get(`${row.contest_id}::${otherId}::${theirRole}`) ?? null,
      myRole,
      otherRole: theirRole,
      firstHandle: firstHandleByProfile.get(otherId) ?? null,
      otherProfile: {
        id: otherId,
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
      profile_a_role,
      profile_b,
      created_at,
      contest:contests(name, event:events(name)),
      profile_a_data:profiles!matches_profile_a_fkey(id, display_name, photo_url, bio, values),
      profile_b_data:profiles!matches_profile_b_fkey(id, display_name, photo_url, bio, values)
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

  const myRole = isA ? row.profile_a_role : otherRole(row.profile_a_role);

  return {
    id: row.id,
    contestId: row.contest_id,
    contestName: row.contest?.name ?? 'Unknown contest',
    eventName: row.contest?.event?.name ?? 'Unknown event',
    createdAt: row.created_at,
    myRole,
    otherProfile: {
      id: other.id,
      displayName: other.display_name,
      photoUrl: other.photo_url,
      role: otherRole(myRole),
      bio: other.bio,
      values: other.values ?? [],
    },
  };
}

// Scoped by role as well as contest: the other dancer may hold a second entry
// here at the opposite role, and this used to be a `.maybeSingle()` on
// (profile, contest) — which now throws the moment that happens.
export async function fetchOtherEntry(
  profileId: string,
  contestId: string,
  role: Enums<'dance_role'>
): Promise<OtherEntry | null> {
  const { data, error } = await supabase
    .from('entries')
    .select('division, note')
    .eq('profile_id', profileId)
    .eq('contest_id', contestId)
    .eq('role', role)
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
