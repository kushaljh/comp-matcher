// Gallery photos and spotlight clips, for whoever is being rendered — a deck
// full of candidates, or one dancer on the partner dossier.
//
// Batched by profile id in one query each, mirroring useDeckHistory: the deck
// asks for every candidate at once rather than firing a request per card. The
// query key is the sorted id list, so overlapping callers share a cache entry.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../lib/database.types';

export type GalleryPhoto = Tables<'profile_photos'>;
export type Clip = Tables<'profile_clips'>;

/** Extra photos beyond profiles.photo_url. The primary is NOT in this table. */
export const MAX_EXTRA_PHOTOS = 3;
/** 4 total with the primary — what the design's thumbnail row lays out. */
export const MAX_PHOTOS_TOTAL = MAX_EXTRA_PHOTOS + 1;
export const MAX_CLIPS = 2;

function keyFor(profileIds: (string | null | undefined)[]): string[] {
  return Array.from(new Set(profileIds.filter((p): p is string => !!p))).sort();
}

export function useGalleryPhotos(
  profileIds: (string | null | undefined)[]
): Record<string, GalleryPhoto[]> {
  const ids = keyFor(profileIds);
  const { data } = useQuery({
    queryKey: ['media', 'photos', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_photos')
        .select('*')
        .in('profile_id', ids)
        .order('position');
      if (error) throw error;
      const byProfile: Record<string, GalleryPhoto[]> = {};
      for (const row of data ?? []) (byProfile[row.profile_id] ??= []).push(row);
      return byProfile;
    },
  });
  return data ?? {};
}

export function useClips(profileIds: (string | null | undefined)[]): Record<string, Clip[]> {
  const ids = keyFor(profileIds);
  const { data } = useQuery({
    queryKey: ['media', 'clips', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_clips')
        .select('*')
        .in('profile_id', ids)
        .order('position');
      if (error) throw error;
      const byProfile: Record<string, Clip[]> = {};
      for (const row of data ?? []) (byProfile[row.profile_id] ??= []).push(row);
      return byProfile;
    },
  });
  return data ?? {};
}
