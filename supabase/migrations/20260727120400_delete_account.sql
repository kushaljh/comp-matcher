-- ============================================================================
-- Comp Matcher — delete_my_account()
-- ============================================================================
-- Self-service account deletion. SECURITY DEFINER so it can remove the caller's
-- storage objects and their auth.users row (which authenticated users cannot
-- touch directly). It deletes ONLY the caller's data, keyed by auth.uid().
--
-- Grant is restricted to `authenticated`; anon/public are revoked so this can
-- never be invoked without a session.
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

revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant  execute on function public.delete_my_account() to authenticated;
