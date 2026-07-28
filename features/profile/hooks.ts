import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import {
  addClip,
  addContact,
  addGalleryPhoto,
  addHistory,
  deleteClip,
  deleteContact,
  deleteEntry,
  deleteGalleryPhoto,
  deleteHistory,
  deleteMyAccount,
  fetchClips,
  fetchContacts,
  fetchGalleryPhotos,
  fetchCurrentUserId,
  fetchHistory,
  fetchMyEntries,
  fetchMyProfile,
  fetchMyProfileId,
  signOut,
  updateContactHandle,
  updateHistory,
  updatePhotoUrl,
  updateProfile,
  uploadProfilePhoto,
  type GalleryPhoto,
} from './api';

export function useMyProfileId() {
  return useQuery({
    queryKey: ['profile', 'my-profile-id'],
    queryFn: fetchMyProfileId,
  });
}

export function useCurrentUserId() {
  return useQuery({
    queryKey: ['profile', 'current-user-id'],
    queryFn: fetchCurrentUserId,
  });
}

export function useMyProfile() {
  const { data: rawProfileId, isLoading: idLoading } = useMyProfileId();
  const profileId = rawProfileId ?? undefined;
  const query = useQuery({
    queryKey: ['profile', 'my-profile', profileId],
    queryFn: () => fetchMyProfile(profileId as string),
    enabled: !!profileId,
  });
  return { ...query, isLoading: idLoading || query.isLoading, profileId };
}

export function useUpdateProfile(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      display_name: string;
      bio: string | null;
      values: string[];
      city: string | null;
      state: string | null;
      country: string | null;
    }) =>
      updateProfile(profileId as string, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'my-profile', profileId] });
    },
  });
}

export function useUploadPhoto(profileId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (localUri: string) => {
      const photoUrl = await uploadProfilePhoto(userId as string, localUri);
      await updatePhotoUrl(profileId as string, photoUrl);
      return photoUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'my-profile', profileId] });
    },
  });
}

// --- Contacts ------------------------------------------------------------------

export function useContacts(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'contacts', profileId],
    queryFn: () => fetchContacts(profileId as string),
    enabled: !!profileId,
  });
}

export function useAddContact(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, handle }: { platform: Enums<'contact_platform'>; handle: string }) =>
      addContact(profileId as string, platform, handle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'contacts', profileId] });
    },
  });
}

export function useUpdateContact(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, handle }: { id: string; handle: string }) => updateContactHandle(id, handle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'contacts', profileId] });
    },
  });
}

export function useDeleteContact(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'contacts', profileId] });
    },
  });
}

// --- Competition history ---------------------------------------------------------

export function useHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'history', profileId],
    queryFn: () => fetchHistory(profileId as string),
    enabled: !!profileId,
  });
}

type HistoryInput = { event_name: string; year: number; contest_name: string; placement: string | null };

export function useAddHistory(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: HistoryInput) => addHistory(profileId as string, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'history', profileId] });
    },
  });
}

export function useUpdateHistory(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, entry }: { id: string; entry: HistoryInput }) => updateHistory(id, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'history', profileId] });
    },
  });
}

export function useDeleteHistory(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'history', profileId] });
    },
  });
}

// --- My entries -----------------------------------------------------------------

export function useMyEntries(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'entries', profileId],
    queryFn: () => fetchMyEntries(profileId as string),
    enabled: !!profileId,
  });
}

export function useDeleteEntry(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; contestId: string }) => deleteEntry(vars.entryId),
    onSuccess: (_data, vars) => {
      // Withdrawing here must also reach every other surface that shows "my
      // entries": The Season's pool/own-entry cache, the Floor's contest stubs,
      // and that contest's deck — they stay mounted in their tabs and would
      // otherwise keep the stale entry. Mirrors features/events/hooks.ts.
      queryClient.invalidateQueries({ queryKey: ['profile', 'entries', profileId] });
      queryClient.invalidateQueries({ queryKey: ['entries', 'byContest', vars.contestId] });
      queryClient.invalidateQueries({ queryKey: ['swipe', 'myEntries'] });
      queryClient.invalidateQueries({ queryKey: ['swipe', 'deck', vars.contestId] });
      // Withdrawing dissolves that contest's pairings (DB trigger).
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

// --- Account ----------------------------------------------------------------------

export function useSignOut() {
  return useMutation({ mutationFn: signOut });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: deleteMyAccount });
}

// --- Gallery photos + spotlight clips -------------------------------------------

// Both invalidate the shared ['media', ...] caches as well as their own: the
// deck and the partner dossier read gallery/clips through features/shared/media
// and would otherwise show the pre-mutation state until an unrelated refetch.

export function useMyGalleryPhotos(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'gallery', profileId],
    queryFn: () => fetchGalleryPhotos(profileId as string),
    enabled: !!profileId,
  });
}

export function useAddGalleryPhoto(profileId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (localUri: string) =>
      addGalleryPhoto(profileId as string, userId as string, localUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'gallery', profileId] });
      queryClient.invalidateQueries({ queryKey: ['media', 'photos'] });
    },
  });
}

export function useDeleteGalleryPhoto(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: GalleryPhoto) => deleteGalleryPhoto(photo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'gallery', profileId] });
      queryClient.invalidateQueries({ queryKey: ['media', 'photos'] });
    },
  });
}

export function useMyClips(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'clips', profileId],
    queryFn: () => fetchClips(profileId as string),
    enabled: !!profileId,
  });
}

export function useAddClip(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clip: { platform: Enums<'clip_platform'>; url: string; videoId: string | null }) =>
      addClip(profileId as string, clip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'clips', profileId] });
      queryClient.invalidateQueries({ queryKey: ['media', 'clips'] });
    },
  });
}

export function useDeleteClip(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'clips', profileId] });
      queryClient.invalidateQueries({ queryKey: ['media', 'clips'] });
    },
  });
}
