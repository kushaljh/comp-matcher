// Data access for invites. Thin wrappers around the supabase client — no React
// here, so these are usable from TanStack Query hooks (hooks.ts) and scripts.
//
// Note how little of this is a plain table write: invites has no INSERT or
// UPDATE policy (supabase/migrations/20260729120000_invite_only.sql), so
// minting and redeeming both go through SECURITY DEFINER RPCs that own the
// quota and single-use rules. Only reads and the "withdraw an unused code"
// delete talk to the table directly.
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../lib/database.types';

export type InviteRow = Tables<'invites'>;

// --- membership ----------------------------------------------------------

// Whether the current user is allowed into the app at all. RLS only ever lets
// a caller read their OWN app_members row, so "a row comes back" and "I am a
// member" are the same question here — the same shape as admin/api.ts's
// fetchIsAdmin().
export async function fetchHasMembership(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_members')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

// --- my invites ----------------------------------------------------------

// Newest first. Filtered explicitly by created_by rather than leaning on RLS:
// for an admin the invites_admin_select policy ORs in every row in the system,
// which is right for the admin panel and wrong for "your invites" in Settings.
export async function fetchMyInvites(userId: string): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** How many more codes the caller may mint. -1 means unlimited (admins). */
export async function fetchInvitesRemaining(): Promise<number> {
  const { data, error } = await supabase.rpc('my_invites_remaining');
  if (error) throw error;
  return data ?? 0;
}

export async function createInvite(): Promise<InviteRow> {
  const { data, error } = await supabase.rpc('create_invite');
  if (error) throw error;
  return data as InviteRow;
}

// Take back a code you have not given out. The invites_delete policy allows
// this only for your own UNREDEEMED rows — a claimed invite is the record of
// how a member got in, so the delete silently affects nothing there.
export async function deleteInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('invites').delete().eq('id', inviteId);
  if (error) throw error;
}

// --- redeeming -----------------------------------------------------------

// Used by (auth)/invite.tsx when a session exists but has no membership. The
// normal signup path does not need this: the auth.users trigger consumes the
// code that rode in on signUp's user metadata.
export async function redeemInvite(code: string): Promise<void> {
  const { error } = await supabase.rpc('redeem_invite', { p_code: code });
  if (error) throw error;
}

// --- admin ---------------------------------------------------------------

// Every invite in the system. Relies on the invites_admin_select policy — a
// non-admin caller just gets their own rows back instead.
export async function fetchAllInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
