-- ============================================================================
-- Comp Matcher — private profile-photos bucket
-- ============================================================================
-- The bucket was created `public = true` as a logged MVP tradeoff (see
-- 20260727120150_storage.sql): every photo object was readable by anyone on the
-- internet holding the URL, signed in or not. Object paths are somewhat
-- unguessable, which is obfuscation, not access control.
--
-- This closes anonymous read. `profiles.photo_url` stops holding a permanent
-- public URL and starts holding the bare object PATH; the client mints a
-- short-lived signed URL at render time.
--
-- WHAT THIS DOES AND DOES NOT GUARANTEE — read before assuming more:
--   * Anonymous readers are locked out completely. This is the actual win.
--   * Any AUTHENTICATED user can still sign a URL for any photo. That is not an
--     oversight: creating a signed URL requires SELECT on the object, and the
--     deck has to sign OTHER dancers' photos to render them at all.
--   Narrowing further means a SECURITY DEFINER RPC that signs only for profiles
--   the caller can legitimately see (their deck, their matches). That is the
--   next step if photo privacy ever needs to be stronger than "signed-in only".
-- ============================================================================

update storage.buckets set public = false where id = 'profile-photos';

-- Replace world-read with authenticated-read. Insert/update/delete stay scoped
-- to the caller's own "<uid>/" folder, unchanged.
drop policy if exists "profile_photos_public_read" on storage.objects;

create policy "profile_photos_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos');

-- ---------------------------------------------------------------------------
-- Backfill: public URL -> bare object path.
--
-- Stored form was:
--   https://<ref>.supabase.co/storage/v1/object/public/profile-photos/<uid>/<file>
-- and becomes:
--   <uid>/<file>
--
-- Idempotent by construction: the WHERE clause only matches rows that still
-- contain the public-object prefix, so re-running this migration (or running it
-- against a project where some rows were already converted) is a no-op for
-- anything already stored as a path.
-- ---------------------------------------------------------------------------
update public.profiles
   set photo_url = split_part(photo_url, '/object/public/profile-photos/', 2)
 where photo_url like '%/object/public/profile-photos/%';
