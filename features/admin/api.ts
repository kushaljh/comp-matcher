// Data-access functions for the admin panel feature. Thin wrappers around the
// supabase client — no React here, so these are usable from TanStack Query
// hooks (hooks.ts) and, in principle, from scripts/tests.
import { supabase } from '../../lib/supabase';
import type { Enums, Tables } from '../../lib/database.types';

export type EventRow = Tables<'events'>;
export type ContestRow = Tables<'contests'>;

// --- admin status ------------------------------------------------------

// Whether the current user has an admin_users row. RLS only ever lets a
// caller read their OWN row (admin_users_select policy), so "a row comes
// back" and "I am an admin" are exactly the same question for this query.
export async function fetchIsAdmin(): Promise<boolean> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) return false;

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

// --- events (admin) ------------------------------------------------------

// All pending events, oldest suggestion first (review queue order). Relies
// entirely on the events_admin_select RLS policy — a non-admin caller would
// just get an RLS-filtered (likely empty, or self-only) result here.
export async function fetchPendingEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// All approved events (no end_date filter — unlike the public Events tab's
// fetchApprovedEvents, an admin needs to manage contests on any approved
// event, including ones already in the past).
export async function fetchApprovedEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'approved')
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function approveEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'approved' }).eq('id', eventId);
  if (error) throw error;
}

// Reject a pending event: there is no "rejected" status, so rejection is a
// hard delete (cascades to any contests/entries/swipes, per the migration's
// header note on FK cascade + RLS).
export async function rejectEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// --- dancers (admin) ------------------------------------------------------

// The roster the suspension panel works from. This is a plain profiles read —
// profiles_select is `using (true)`, so it grants an admin NOTHING a signed-in
// dancer couldn't already see. Suspension deliberately came with no new
// visibility: swipes stay swiper-only and matches stay member-only.
export type DancerRow = {
  id: string;
  display_name: string;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  suspended_at: string | null;
};

export async function fetchDancers(): Promise<DancerRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, photo_url, city, country, suspended_at')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Suspend or reinstate. Goes through the RPC rather than an UPDATE because RLS
// cannot limit a policy to one COLUMN — an admin update policy on profiles
// would also let admins rewrite anyone's name, bio or photo. The function
// touches suspended_at and nothing else, and raises if the caller isn't an
// admin or is aiming at their own account.
export async function setSuspended(profileId: string, suspended: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_set_suspended', {
    p_profile_id: profileId,
    p_suspended: suspended,
  });
  if (error) throw error;
  return data;
}

// --- contests (admin) -----------------------------------------------------

export async function fetchContestsForEvent(eventId: string): Promise<ContestRow[]> {
  const { data, error } = await supabase
    .from('contests')
    .select('*')
    .eq('event_id', eventId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addContest(params: {
  eventId: string;
  name: string;
  divisions: Enums<'division'>[];
}): Promise<void> {
  const { error } = await supabase.from('contests').insert({
    event_id: params.eventId,
    name: params.name,
    divisions: params.divisions,
  });
  if (error) throw error;
}

export async function deleteContest(contestId: string): Promise<void> {
  const { error } = await supabase.from('contests').delete().eq('id', contestId);
  if (error) throw error;
}
