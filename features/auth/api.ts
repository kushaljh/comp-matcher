// Auth actions + the onboarding write flow (photo upload, profile, contacts,
// competition history) — the same operations scripts/verify-wp1.mjs exercises
// against the live DB with the anon client.

import { Platform } from 'react-native';
import type { Enums } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type DanceRole = Enums<'dance_role'>;
export type ContactPlatform = Enums<'contact_platform'>;

export function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // Confirmation emails redirect back to wherever the user signed up
      // (deployed site or local dev) instead of the project's Site URL.
      // The origin must be allow-listed in Supabase Auth -> URL Configuration.
      emailRedirectTo:
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : undefined,
    },
  });
}

export function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email);
}

export function signOut() {
  return supabase.auth.signOut();
}

export type OnboardingContact = {
  platform: ContactPlatform;
  handle: string;
};

export type OnboardingHistoryRow = {
  event_name: string;
  year: number;
  contest_name: string;
  placement: string | null;
};

export type OnboardingInput = {
  userId: string;
  photoUri: string;
  displayName: string;
  values: string[];
  bio: string | null;
  contacts: OnboardingContact[];
  history: OnboardingHistoryRow[];
};

async function uploadProfilePhoto(userId: string, uri: string): Promise<string> {
  // The picked asset is a local (native) or blob/data (web) URI — fetch it
  // back into a Blob so it can be handed to storage.upload with a
  // contentType, per the object-path-scoped storage policy (`${uid}/...`).
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  return data.publicUrl;
}

// submitOnboarding must converge on a retry after a partial failure (e.g. the
// profile insert lands but the contacts insert fails on a flaky connection,
// the user clicks "Finish" again). Two things make that safe:
//   - profiles is upserted on the `user_id` unique constraint instead of
//     inserted, so a retry updates the same row instead of hitting 23505
//     unique_violation (which previously left the user permanently wedged on
//     onboarding for the rest of the session — a reload was the only way
//     out, and it dumped them into the tabs with zero contacts).
//   - contacts/history use delete-then-insert ("replace") semantics scoped
//     to the profile, so a retry's insert is never blocked by rows a prior
//     partial attempt already wrote, regardless of whether the user edited
//     any fields between attempts.
export async function submitOnboarding(input: OnboardingInput): Promise<string> {
  const photoUrl = await uploadProfilePhoto(input.userId, input.photoUri);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: input.userId,
        display_name: input.displayName,
        values: input.values,
        bio: input.bio,
        photo_url: photoUrl,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();
  if (profileError) throw profileError;

  const profileId = profile.id;

  const { error: deleteContactsError } = await supabase
    .from('profile_contacts')
    .delete()
    .eq('profile_id', profileId);
  if (deleteContactsError) throw deleteContactsError;

  if (input.contacts.length > 0) {
    const { error } = await supabase
      .from('profile_contacts')
      .insert(input.contacts.map((c) => ({ profile_id: profileId, platform: c.platform, handle: c.handle })));
    if (error) throw error;
  }

  const { error: deleteHistoryError } = await supabase
    .from('competition_history')
    .delete()
    .eq('profile_id', profileId);
  if (deleteHistoryError) throw deleteHistoryError;

  if (input.history.length > 0) {
    const { error } = await supabase
      .from('competition_history')
      .insert(input.history.map((h) => ({ profile_id: profileId, ...h })));
    if (error) throw error;
  }

  return profileId;
}
