// Signed-URL resolution for profile photos.
//
// The profile-photos bucket is private (see the 20260728170000 migration), so
// `profiles.photo_url` holds an object PATH, not a fetchable URL. Everything
// that renders a photo resolves it through here.
//
// Batching is the point: the deck resolves up to a full stack of candidates and
// the Dance Card a whole list, so these go out as ONE createSignedUrls call
// rather than one request per face. The query key is the sorted path list, so
// two components asking for overlapping sets share a cache entry and a
// re-render with the same faces costs nothing.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

const BUCKET = 'profile-photos';

/** How long a minted URL stays valid. */
const TTL_SECONDS = 60 * 60;
/**
 * Re-mint at 80% of the lifetime. A URL handed to <Image> keeps working while
 * the component is mounted, so the only requirement is that we never hand out
 * one that is about to die mid-scroll.
 */
const STALE_MS = TTL_SECONDS * 1000 * 0.8;

/** Anything falsy is dropped, so callers can pass `photo_url` straight through. */
function normalize(paths: (string | null | undefined)[]): string[] {
  return Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS);
  if (error) throw error;

  const byPath: Record<string, string> = {};
  for (const row of data ?? []) {
    // createSignedUrls reports per-item failures inline (a missing object, say)
    // rather than rejecting the batch. Skipping those degrades to the monogram
    // placeholder for that one face instead of blanking every photo.
    if (row.signedUrl && row.path) byPath[row.path] = row.signedUrl;
  }
  return byPath;
}

/**
 * Resolve many photo paths at once. Returns a path -> signed URL map; a path
 * still loading or failed to sign is simply absent, which callers render as
 * "no photo".
 */
export function useSignedPhotoUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const key = normalize(paths);
  const { data } = useQuery({
    queryKey: ['photos', 'signed', key],
    enabled: key.length > 0,
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    queryFn: () => signPaths(key),
  });
  return data ?? {};
}

/** Single-photo convenience wrapper. Returns null until resolved. */
export function useSignedPhotoUrl(path: string | null | undefined): string | null {
  const map = useSignedPhotoUrls([path]);
  return path ? (map[path] ?? null) : null;
}
