import { useQuery } from '@tanstack/react-query';
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

export function useOtherEntry(profileId: string | undefined, contestId: string | undefined) {
  return useQuery({
    queryKey: ['matches', 'other-entry', profileId, contestId],
    queryFn: () => fetchOtherEntry(profileId as string, contestId as string),
    enabled: !!profileId && !!contestId,
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
