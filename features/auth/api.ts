// Auth actions + the onboarding write flow (photo upload, profile, contacts,
// competition history) — the same operations scripts/verify-wp1.mjs exercises
// against the live DB with the anon client.

import type { Enums } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export type DanceRole = Enums<'dance_role'>;
export type ContactPlatform = Enums<'contact_platform'>;

export function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
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
  role: DanceRole;
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

export async function submitOnboarding(input: OnboardingInput): Promise<string> {
  const photoUrl = await uploadProfilePhoto(input.userId, input.photoUri);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      user_id: input.userId,
      display_name: input.displayName,
      role: input.role,
      values: input.values,
      bio: input.bio,
      photo_url: photoUrl,
    })
    .select('id')
    .single();
  if (profileError) throw profileError;

  const profileId = profile.id;

  if (input.contacts.length > 0) {
    const { error } = await supabase
      .from('profile_contacts')
      .insert(input.contacts.map((c) => ({ profile_id: profileId, platform: c.platform, handle: c.handle })));
    if (error) throw error;
  }

  if (input.history.length > 0) {
    const { error } = await supabase
      .from('competition_history')
      .insert(input.history.map((h) => ({ profile_id: profileId, ...h })));
    if (error) throw error;
  }

  return profileId;
}
