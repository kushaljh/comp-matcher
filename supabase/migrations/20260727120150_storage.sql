-- ============================================================================
-- Comp Matcher — Storage: profile-photos bucket + object policies
-- ============================================================================
-- Kept in its own migration (its own transaction) so an ownership hiccup on
-- storage.objects on a hosted project cannot roll back the core table RLS.
--
-- MVP tradeoff (LOGGED for a pre-public-launch revisit): the bucket is PUBLIC,
-- so photo objects are world-readable via their public URL. Object paths are
-- somewhat unguessable but are not a real access control. Before a public
-- launch, switch to a private bucket + signed URLs.
--
-- Writes are restricted to a per-user folder named after the caller's
-- auth.uid(): objects must be named "<uid>/<filename>". A uuid contains no LIKE
-- wildcard characters, so the "<uid>/%" pattern is a safe prefix match.
--
-- NOTE: on a hosted project, storage.objects is owned by supabase_storage_admin.
-- Applying these policies via `db push` runs as `postgres`, which Supabase
-- grants the rights to manage storage policies. If a specific project rejects
-- CREATE POLICY here with "must be owner of table objects", create the four
-- policies from the Storage section of the dashboard instead (same predicates).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Public read: consistent with public = true, and also permits authenticated
-- API/list reads of the bucket.
create policy "profile_photos_public_read" on storage.objects
  for select to public
  using (bucket_id = 'profile-photos');

create policy "profile_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and name like (select auth.uid())::text || '/%'
  );

create policy "profile_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and name like (select auth.uid())::text || '/%'
  )
  with check (
    bucket_id = 'profile-photos'
    and name like (select auth.uid())::text || '/%'
  );

create policy "profile_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and name like (select auth.uid())::text || '/%'
  );
