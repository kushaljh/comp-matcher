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

// The roster WITH the invite trail. Unlike fetchDancers() above this is not a
// plain profiles read — who vouched for whom and when someone signed up are
// things no client could see before, so they come through a SECURITY DEFINER
// RPC that returns an explicit column list and raises for a non-admin caller.
// See supabase/migrations/20260729140000_admin_panel.sql.
export type RosterRow = {
  profile_id: string;
  user_id: string;
  display_name: string;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  suspended_at: string | null;
  signed_up_at: string;
  onboarded_at: string;
  joined_at: string | null;
  invited_by_name: string | null;
  invite_quota: number;
  invites_created: number;
  invites_claimed: number;
};

export async function fetchDancerRoster(): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc('admin_dancer_roster');
  if (error) throw error;
  return (data ?? []) as RosterRow[];
}

// Inviting is a granted privilege: a new member starts at 0 and an admin
// raises it. Clamped to 0..20 in the function, logged to admin_actions.
export async function setInviteQuota(profileId: string, quota: number): Promise<number> {
  const { data, error } = await supabase.rpc('admin_set_invite_quota', {
    p_profile_id: profileId,
    p_quota: quota,
  });
  if (error) throw error;
  return data as number;
}

// --- overview + audit log --------------------------------------------------

export type AdminOverview = {
  members: number;
  dancers: number;
  suspended: number;
  joined_last_7d: number;
  pending_events: number;
  invites_outstanding: number;
  invites_claimed: number;
  can_invite: number;
};

export async function fetchOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return data as unknown as AdminOverview;
}

export type AdminActionRow = Tables<'admin_actions'>;

// The log is append-only by construction: every row is written by a SECURITY
// DEFINER function, and admin_actions has no insert/update/delete policy, so
// this read is the only thing the client can do with it.
export async function fetchAdminActions(subjectUserId?: string): Promise<AdminActionRow[]> {
  let query = supabase
    .from('admin_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (subjectUserId) query = query.eq('subject_user', subjectUserId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Suspend or reinstate. Goes through the RPC rather than an UPDATE because RLS
// cannot limit a policy to one COLUMN — an admin update policy on profiles
// would also let admins rewrite anyone's name, bio or photo. The function
// touches suspended_at and nothing else, and raises if the caller isn't an
// admin or is aiming at their own account.
export async function setSuspended(
  profileId: string,
  suspended: boolean,
  reason?: string | null
): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_set_suspended', {
    p_profile_id: profileId,
    p_suspended: suspended,
    p_reason: reason ?? null,
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
