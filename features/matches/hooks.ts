import { useQuery } from '@tanstack/react-query';
import type { Enums } from '../../lib/database.types';
import {
  fetchMatchDetail,
  fetchMatches,
  fetchMyProfileId,
  fetchOtherContacts,
  fetchOtherEntry,
  fetchOtherHistory,
} from './api';

export function useMyProfileId() {
  return useQuery({
    queryKey: ['matches', 'my-profile-id'],
    queryFn: fetchMyProfileId,
  });
}

export function useMatches() {
  const { data: myProfileId, isLoading: profileLoading } = useMyProfileId();
  const query = useQuery({
    queryKey: ['matches', 'list', myProfileId],
    queryFn: () => fetchMatches(myProfileId as string),
    enabled: !!myProfileId,
  });
  return { ...query, isLoading: profileLoading || query.isLoading };
}

export function useMatchDetail(matchId: string) {
  const { data: myProfileId, isLoading: profileLoading } = useMyProfileId();
  const query = useQuery({
    queryKey: ['matches', 'detail', matchId, myProfileId],
    queryFn: () => fetchMatchDetail(matchId, myProfileId as string),
    enabled: !!matchId && !!myProfileId,
  });
  return { ...query, isLoading: profileLoading || query.isLoading };
}

// The role is part of the key as well as the query: the same dancer can hold a
// second entry in this contest at the opposite role, and that one belongs to a
// different pairing entirely.
export function useOtherEntry(
  profileId: string | undefined,
  contestId: string | undefined,
  role: Enums<'dance_role'> | undefined
) {
  return useQuery({
    queryKey: ['matches', 'other-entry', profileId, contestId, role],
    queryFn: () => fetchOtherEntry(profileId as string, contestId as string, role as Enums<'dance_role'>),
    enabled: !!profileId && !!contestId && !!role,
  });
}

export function useOtherContacts(profileId: string | undefined) {
  return useQuery({
    queryKey: ['matches', 'other-contacts', profileId],
    queryFn: () => fetchOtherContacts(profileId as string),
    enabled: !!profileId,
  });
}

export function useOtherHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ['matches', 'other-history', profileId],
    queryFn: () => fetchOtherHistory(profileId as string),
    enabled: !!profileId,
  });
}
