import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import {
  addContact,
  addHistory,
  deleteContact,
  deleteEntry,
  deleteHistory,
  deleteMyAccount,
  fetchContacts,
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
    mutationFn: (patch: { display_name: string; bio: string | null; values: string[] }) =>
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
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'entries', profileId] });
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
