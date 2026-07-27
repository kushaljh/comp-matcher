-- ============================================================================
-- Comp Matcher — fix delete_my_account() on hosted Supabase
-- ============================================================================
-- Hosted Supabase installs a statement-level BEFORE DELETE trigger on
-- storage.objects (storage.protect_delete()) that rejects raw SQL deletes
-- unless the session opts in via `storage.allow_delete_query`. The original
-- definition (20260727120400) therefore failed for every caller — even users
-- with zero photos, since a statement-level trigger fires regardless of row
-- count. Found by WP4's live verification.
--
-- Identical to the original except for the one set_config() line. The third
-- `true` makes the setting transaction-local, so the opt-in cannot leak into
-- other statements on the connection (relevant under PostgREST pooling).
-- ============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Hosted storage protection trigger requires this opt-in for raw deletes.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- 1) Remove the caller's photos from the profile-photos bucket.
  delete from storage.objects
  where bucket_id = 'profile-photos'
    and name like v_uid::text || '/%';

  -- 2) Delete the caller's profile. FK ON DELETE CASCADE removes contacts,
  --    competition_history, entries, swipes (as swiper AND as target), and
  --    matches referencing this profile.
  delete from public.profiles where user_id = v_uid;

  -- 3) Remove the auth user itself.
  delete from auth.users where id = v_uid;
end;
$$;

-- Re-assert grants (CREATE OR REPLACE preserves ACLs, but keep this explicit
-- and idempotent in case the function is ever dropped/recreated).
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant  execute on function public.delete_my_account() to authenticated;
