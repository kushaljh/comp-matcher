-- ============================================================================
-- Comp Matcher — Match creation trigger
-- ============================================================================
-- When a user inserts a `like` swipe, check whether the target has already
-- liked them back in the SAME contest. If so, create the (ordered) match row.
--
-- Why SECURITY DEFINER:
--   * The reciprocal-like check must read the OTHER user's swipe, which the
--     current user cannot see under RLS (swipes are swiper-only). Running as
--     the function owner lets the trigger see both swipes without ever exposing
--     the other swipe to the client.
--   * matches has no client write path; the definer (table owner) inserts it.
--   search_path is pinned to '' and every object is schema-qualified.
-- ============================================================================

create or replace function public.handle_new_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid;
  b uuid;
begin
  -- Only mutual likes create matches.
  if new.direction <> 'like'::public.swipe_direction then
    return new;
  end if;

  -- Did the target already like the swiper in this contest?
  if exists (
    select 1
    from public.swipes s
    where s.contest_id        = new.contest_id
      and s.swiper_profile_id = new.target_profile_id
      and s.target_profile_id = new.swiper_profile_id
      and s.direction         = 'like'::public.swipe_direction
  ) then
    -- Store the pair ordered so (a, b) is canonical.
    if new.swiper_profile_id < new.target_profile_id then
      a := new.swiper_profile_id;
      b := new.target_profile_id;
    else
      a := new.target_profile_id;
      b := new.swiper_profile_id;
    end if;

    insert into public.matches (contest_id, profile_a, profile_b)
    values (new.contest_id, a, b)
    on conflict (contest_id, profile_a, profile_b) do nothing;
  end if;

  return new;
end;
$$;

-- Trigger function is invoked by the trigger, not called directly; it needs no
-- role EXECUTE grant. Lock it down anyway so it cannot be called via RPC.
revoke execute on function public.handle_new_swipe() from public;

create trigger swipes_after_insert_create_match
  after insert on public.swipes
  for each row
  when (new.direction = 'like'::public.swipe_direction)
  execute function public.handle_new_swipe();
