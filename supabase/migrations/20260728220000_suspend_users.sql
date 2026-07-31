-- ============================================================================
-- Comp Matcher — admin suspension: take a dancer off the floor, reversibly
-- ============================================================================
--
-- One new admin capability and NOT ONE BYTE MORE. Admins still cannot read
-- swipes or matches: no policy below touches either table, and the RPC returns
-- nothing but the flag it just set. Who asked whom, and who paired with whom,
-- stays exactly as private as it was — see the header of 20260727120100_rls.sql
-- for why that is the app's core promise.
--
-- Reversible by construction: suspending sets a timestamp and un-suspending
-- clears it. Nothing is deleted, no pairing is dissolved, no entry is dropped.
-- A reinstated dancer picks up exactly where they left off.
--
-- Why an RPC and not an admin UPDATE policy on profiles: RLS cannot restrict
-- WHICH COLUMNS a policy covers, and profiles already carries a table-wide
-- `grant update ... to authenticated` (20260727120100_rls.sql:31). An additive
-- admin policy would therefore let any admin rewrite anyone's display name,
-- bio, photo or location. A SECURITY DEFINER function that touches one column
-- is the narrow version of the same power.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The flag. Null means active, which makes every existing row correct
--    without a backfill.
-- ---------------------------------------------------------------------------
alter table public.profiles add column suspended_at timestamptz;

-- Partial index: the enforcement checks below all ask "is this one suspended?"
-- and the suspended set is expected to stay tiny.
create index profiles_suspended_idx on public.profiles (id) where suspended_at is not null;

-- ---------------------------------------------------------------------------
-- 2) The admin action.
--
--    SECURITY DEFINER because a non-admin caller has no UPDATE path to someone
--    else's profile row and must not be given one. The admin check is the same
--    self-lookup shape the rest of the admin policies use: it only ever asks
--    "is MY uid in admin_users?", which admin_users' own-row SELECT policy
--    already permits.
--
--    An admin cannot suspend themselves — locking the last admin out of their
--    own panel is a support ticket nobody wants.
-- ---------------------------------------------------------------------------
create function public.admin_set_suspended(
  p_profile_id uuid,
  p_suspended  boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new timestamptz;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'an admin cannot suspend their own account'
      using errcode = 'check_violation';
  end if;

  v_new := case when p_suspended then now() else null end;

  update public.profiles
     set suspended_at = v_new
   where id = p_profile_id;

  if not found then
    raise exception 'no such profile' using errcode = 'no_data_found';
  end if;

  return v_new;
end;
$$;

revoke execute on function public.admin_set_suspended(uuid, boolean) from public;
grant  execute on function public.admin_set_suspended(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Enforcement: a suspended dancer is off the floor in both directions.
--
--    Dealt to nobody (the three deck functions), and unable to act (the two
--    insert policies). Both halves are needed: hiding them from decks alone
--    would still let a suspended dancer swipe on people whose decks they had
--    already loaded.
-- ---------------------------------------------------------------------------

-- 3a) get_deck — candidates exclude the suspended, and a suspended caller is
--     dealt nothing at all (the `me` CTE comes back empty).
create or replace function public.get_deck(p_entry_id uuid)
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
  note         text
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
    e.note
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

-- 3b) get_passed — a suspended dancer isn't offered back either, for the same
--     reason a withdrawn one isn't: the deck could not deal them.
create or replace function public.get_passed(p_entry_id uuid)
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
  note         text
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
    e.note
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

-- 3c) get_pool_counts — must drop in lockstep with the deck, or the Season goes
--     back to promising dancers the floor will not deal.
create or replace function public.get_pool_counts(
  p_contest_id uuid,
  p_role       public.dance_role
)
returns table (
  division  public.division,
  available integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select p.id as profile_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.suspended_at is null
  )
  select e.division, count(*)::integer as available
  from me
  join public.entries e
    on e.contest_id = p_contest_id
   and e.role       = public.other_role(p_role)
   and e.profile_id <> me.profile_id
  join public.profiles cand
    on cand.id = e.profile_id
   and cand.suspended_at is null
  where not exists (
    select 1
    from public.swipes s
    where s.contest_id        = p_contest_id
      and s.swiper_profile_id = me.profile_id
      and s.target_profile_id = e.profile_id
      and s.swiper_role       = p_role
  )
  and not exists (
    select 1
    from public.matches m
    where m.contest_id = p_contest_id
      and (
        (m.profile_a = me.profile_id and m.profile_b = e.profile_id
           and m.profile_a_role = p_role)
        or
        (m.profile_b = me.profile_id and m.profile_a = e.profile_id
           and m.profile_a_role = public.other_role(p_role))
      )
  )
  group by e.division;
$$;

-- 3d) A suspended dancer cannot swipe. Without this they could still act on a
--     deck their client had already fetched.
drop policy swipes_insert on public.swipes;
create policy swipes_insert on public.swipes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = swipes.swiper_profile_id
        and p.user_id = (select auth.uid())
        and p.suspended_at is null
    )
    and exists (
      select 1 from public.entries e
      where e.contest_id = swipes.contest_id
        and e.profile_id = swipes.swiper_profile_id
        and e.role       = swipes.swiper_role
    )
  );

-- 3e) ...nor enter another contest. Existing entries are deliberately left
--     alone: suspension is reversible, and deleting them would dissolve
--     pairings that a reinstatement could not bring back.
drop policy entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = entries.profile_id
        and p.user_id = (select auth.uid())
        and p.suspended_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Contact details go dark for the duration.
--
--    Without this, suspension would be cosmetic for the case that most often
--    prompts it: a dancer who has already matched keeps their partners' handles
--    and their partners keep theirs. Hidden in BOTH directions while either
--    side is suspended, and restored the moment the flag clears.
--
--    The owner's own row is untouched — a suspended dancer can still see and
--    edit their own contact details.
-- ---------------------------------------------------------------------------
drop policy profile_contacts_select on public.profile_contacts;
create policy profile_contacts_select on public.profile_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_contacts.profile_id
        and p.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.matches m
      join public.profiles me
        on me.user_id = (select auth.uid())
       and me.suspended_at is null
      join public.profiles them
        on them.id = profile_contacts.profile_id
       and them.suspended_at is null
      where (m.profile_a = me.id and m.profile_b = profile_contacts.profile_id)
         or (m.profile_b = me.id and m.profile_a = profile_contacts.profile_id)
    )
  );
