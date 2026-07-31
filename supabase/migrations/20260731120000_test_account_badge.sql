-- ============================================================================
-- Comp Matcher — mark the house band: a TEST badge for seeded accounts
-- ============================================================================
-- The floor is stocked with seeded dancers (demo-*@demo.test, *@fixture.test,
-- wt-*@verify.test) so every division has someone to swipe on. Real dancers
-- should be able to tell them apart at a glance, so their cards get a TEST
-- pill next to the name.
--
-- The flag is DERIVED, not hand-set: every seeding script creates its users on
-- the reserved .test TLD (RFC 2606 — mail there can never be delivered, so no
-- real dancer can confirm a sign-up from one). A trigger stamps the flag at
-- profile creation, which means future seeding scripts get it for free and no
-- script has to remember to set it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The flag. Default false: every real dancer is correct without a backfill.
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_test boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Stamp it at creation. SECURITY DEFINER because the inserting client's
--    role cannot read auth.users (and must not be able to) — the trigger only
--    ever looks up the email of the user_id being inserted.
-- ---------------------------------------------------------------------------
create function public.flag_test_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from auth.users u
    where u.id = new.user_id
      and u.email like '%.test'
  ) then
    new.is_test := true;
  end if;
  return new;
end;
$$;

revoke execute on function public.flag_test_profile() from public;

create trigger profiles_flag_test
  before insert on public.profiles
  for each row execute function public.flag_test_profile();

-- ---------------------------------------------------------------------------
-- 3) Backfill the seeded accounts that already exist.
-- ---------------------------------------------------------------------------
update public.profiles p
   set is_test = true
  from auth.users u
 where u.id = p.user_id
   and u.email like '%.test';

-- ---------------------------------------------------------------------------
-- 4) Deal the flag with the card: get_deck and get_passed grow an is_test
--    column. DROP + CREATE (not OR REPLACE) because the return type changes,
--    so the grants are restated below. Bodies are otherwise verbatim from
--    20260728220000_suspend_users.sql.
-- ---------------------------------------------------------------------------
drop function public.get_deck(uuid);

create function public.get_deck(p_entry_id uuid)
returns table (
  entry_id     uuid,
  profile_id   uuid,
  display_name text,
  photo_url    text,
  bio          text,
  "values"     text[],
  division     public.division,
  role         public.dance_role,
  city         text,
  state        text,
  country      text,
  note         text,
  is_test      boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select e.profile_id, e.contest_id, e.division, e.role
    from public.entries e
    join public.profiles pr
      on pr.id      = e.profile_id
     and pr.user_id = (select auth.uid())
     and pr.suspended_at is null
    where e.id = p_entry_id
  )
  select
    e.id           as entry_id,
    p.id           as profile_id,
    p.display_name,
    p.photo_url,
    p.bio,
    p."values",
    e.division,
    e.role,
    p.city,
    p.state,
    p.country,
    e.note,
    p.is_test
  from me
  join public.entries e
    on e.contest_id = me.contest_id
   and e.division   = me.division
   and e.role       = public.other_role(me.role)
   and e.profile_id <> me.profile_id
  join public.profiles p
    on p.id = e.profile_id
   and p.suspended_at is null
  where not exists (
    select 1
    from public.swipes s
    where s.contest_id        = me.contest_id
      and s.swiper_profile_id = me.profile_id
      and s.target_profile_id = p.id
      and s.swiper_role       = me.role
  )
  and not exists (
    select 1
    from public.matches m
    where m.contest_id = me.contest_id
      and (
        (m.profile_a = me.profile_id and m.profile_b = p.id
           and m.profile_a_role = me.role)
        or
        (m.profile_b = me.profile_id and m.profile_a = p.id
           and m.profile_a_role = public.other_role(me.role))
      )
  );
$$;

drop function public.get_passed(uuid);

create function public.get_passed(p_entry_id uuid)
returns table (
  entry_id     uuid,
  profile_id   uuid,
  display_name text,
  photo_url    text,
  bio          text,
  "values"     text[],
  division     public.division,
  role         public.dance_role,
  city         text,
  state        text,
  country      text,
  note         text,
  is_test      boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select e.profile_id, e.contest_id, e.division, e.role
    from public.entries e
    join public.profiles pr
      on pr.id      = e.profile_id
     and pr.user_id = (select auth.uid())
     and pr.suspended_at is null
    where e.id = p_entry_id
  )
  select
    e.id           as entry_id,
    p.id           as profile_id,
    p.display_name,
    p.photo_url,
    p.bio,
    p."values",
    e.division,
    e.role,
    p.city,
    p.state,
    p.country,
    e.note,
    p.is_test
  from me
  join public.swipes s
    on s.contest_id        = me.contest_id
   and s.swiper_profile_id = me.profile_id
   and s.swiper_role       = me.role
   and s.direction         = 'pass'::public.swipe_direction
  join public.entries e
    on e.contest_id = me.contest_id
   and e.division   = me.division
   and e.role       = public.other_role(me.role)
   and e.profile_id = s.target_profile_id
  join public.profiles p
    on p.id = e.profile_id
   and p.suspended_at is null
  order by s.created_at desc;
$$;

revoke execute on function public.get_deck(uuid)   from public;
revoke execute on function public.get_passed(uuid) from public;
grant  execute on function public.get_deck(uuid)   to authenticated;
grant  execute on function public.get_passed(uuid) to authenticated;
