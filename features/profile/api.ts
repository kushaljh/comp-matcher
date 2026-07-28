// Data access for the Profile feature: my profile, contacts, competition
// history, and my contest entries, plus account actions (sign out / delete).
import { supabase } from '../../lib/supabase';
import type { Enums, Tables } from '../../lib/database.types';

export type Profile = Tables<'profiles'>;
export type ProfileContact = Tables<'profile_contacts'>;
export type HistoryRow = Tables<'competition_history'>;

export type MyEntry = {
  id: string;
  contestId: string;
  contestName: string;
  eventName: string;
  division: Enums<'division'>;
  note: string | null;
};

type RawEntryRow = {
  id: string;
  contest_id: string;
  division: Enums<'division'>;
  note: string | null;
  contest: { name: string; event: { name: string } | null } | null;
};

export async function fetchMyProfileId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_profile_id');
  if (error) throw error;
  return data ?? null;
}

export async function fetchCurrentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function fetchMyProfile(profileId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  profileId: string,
  patch: { display_name: string; bio: string | null; values: string[] }
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
  if (error) throw error;
}

// Fetches the image at `localUri`, converts it to an ArrayBuffer (the
// approach Supabase documents for Expo — RN's fetch/Blob does not reliably
// upload raw bytes otherwise), and uploads it to the shared profile-photos
// bucket under the caller's own folder (enforced by storage RLS).
//
// Returns the object PATH, not a URL: the bucket is private, so there is no
// permanent fetchable address. Rendering goes through
// features/shared/photo.ts's signing hook.
export async function uploadProfilePhoto(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  return path;
}

/** `photoPath` is a storage object path — see uploadProfilePhoto. */
export async function updatePhotoUrl(profileId: string, photoPath: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ photo_url: photoPath }).eq('id', profileId);
  if (error) throw error;
}

// --- Contacts ----------------------------------------------------------------

export async function fetchContacts(profileId: string): Promise<ProfileContact[]> {
  const { data, error } = await supabase
    .from('profile_contacts')
    .select('*')
    .eq('profile_id', profileId)
    .order('platform');
  if (error) throw error;
  return data ?? [];
}

export async function addContact(
  profileId: string,
  platform: Enums<'contact_platform'>,
  handle: string
): Promise<void> {
  const { error } = await supabase
    .from('profile_contacts')
    .insert({ profile_id: profileId, platform, handle });
  if (error) throw error;
}

export async function updateContactHandle(id: string, handle: string): Promise<void> {
  const { error } = await supabase.from('profile_contacts').update({ handle }).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('profile_contacts').delete().eq('id', id);
  if (error) throw error;
}

// --- Competition history ------------------------------------------------------

export async function fetchHistory(profileId: string): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from('competition_history')
    .select('*')
    .eq('profile_id', profileId)
    .order('year', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addHistory(
  profileId: string,
  entry: { event_name: string; year: number; contest_name: string; placement: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('competition_history')
    .insert({ profile_id: profileId, ...entry });
  if (error) throw error;
}

export async function updateHistory(
  id: string,
  entry: { event_name: string; year: number; contest_name: string; placement: string | null }
): Promise<void> {
  const { error } = await supabase.from('competition_history').update(entry).eq('id', id);
  if (error) throw error;
}

export async function deleteHistory(id: string): Promise<void> {
  const { error } = await supabase.from('competition_history').delete().eq('id', id);
  if (error) throw error;
}

// --- My entries ----------------------------------------------------------------

export async function fetchMyEntries(profileId: string): Promise<MyEntry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, contest_id, division, note, contest:contests(name, event:events(name))')
    .eq('profile_id', profileId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawEntryRow[];
  return rows.map((row) => ({
    id: row.id,
    contestId: row.contest_id,
    contestName: row.contest?.name ?? 'Unknown contest',
    eventName: row.contest?.event?.name ?? 'Unknown event',
    division: row.division,
    note: row.note,
  }));
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}

// --- Account -------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await signOut();
}
