// Data-access functions for the events feature. Thin wrappers around the
// supabase client — no React here, so these are usable from TanStack Query
// hooks (hooks.ts) and, in principle, from scripts/tests.
import { supabase } from '../../lib/supabase';
import type { Enums, Tables } from '../../lib/database.types';

export type EventRow = Tables<'events'>;
export type ContestRow = Tables<'contests'>;
export type EntryRow = Tables<'entries'>;

// --- events ------------------------------------------------------------

// Approved, not-yet-ended events, soonest first. `status = 'approved'` is
// filtered explicitly here (not just left to RLS) so that a suggester's own
// still-pending event never shows up in this public list — RLS separately
// guarantees that OTHER users can never see anyone else's pending event.
export async function fetchApprovedEvents(): Promise<EventRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'approved')
    .gte('end_date', today)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type NewEventInput = {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  website_url: string | null;
  facebook_url: string | null;
};

// Deliberately never sends `status` — the column defaults to 'pending' and
// the events_insert RLS policy requires it, so a suggested event can only
// ever land pending regardless of what a caller might try to pass in.
export async function suggestEvent(input: NewEventInput): Promise<{ id: string }> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('events')
    .insert({
      name: input.name,
      location: input.location,
      start_date: input.start_date,
      end_date: input.end_date,
      website_url: input.website_url,
      facebook_url: input.facebook_url,
      suggested_by: user.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

// --- contests ------------------------------------------------------------

export async function fetchContestsForEvent(eventId: string): Promise<ContestRow[]> {
  const { data, error } = await supabase
    .from('contests')
    .select('*')
    .eq('event_id', eventId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// --- profile / entries ------------------------------------------------------------

export async function fetchMyProfileId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_profile_id');
  if (error) throw error;
  return data;
}

// A dancer may hold up to two entries in one contest — one per role — so this
// returns a list, ordered leader-first for a stable UI. It replaced a
// `.maybeSingle()` lookup, which now throws the moment someone enters twice.
export async function fetchMyEntries(
  contestId: string,
  profileId: string
): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('contest_id', contestId)
    .eq('profile_id', profileId)
    .order('role');
  if (error) throw error;
  return data ?? [];
}

export async function joinContest(params: {
  profileId: string;
  contestId: string;
  division: Enums<'division'>;
  role: Enums<'dance_role'>;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('entries').insert({
    profile_id: params.profileId,
    contest_id: params.contestId,
    division: params.division,
    role: params.role,
    note: params.note,
  });
  if (error) throw error;
}

export async function updateEntryDivision(entryId: string, division: Enums<'division'>): Promise<void> {
  const { error } = await supabase.from('entries').update({ division }).eq('id', entryId);
  if (error) throw error;
}

export async function leaveContest(entryId: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', entryId);
  if (error) throw error;
}

// Every entry in one contest (id, division, whose profile) — readable by any
// authenticated user (RLS: entries_select is `using (true)`). The Season uses
// this both to find the caller's own entry and to count division pool sizes.
export type EntryForCounts = {
  id: string;
  division: Enums<'division'>;
  role: Enums<'dance_role'>;
  profile_id: string;
};

export async function fetchEntriesForContest(contestId: string): Promise<EntryForCounts[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, division, role, profile_id')
    .eq('contest_id', contestId);
  if (error) throw error;
  return data ?? [];
}
