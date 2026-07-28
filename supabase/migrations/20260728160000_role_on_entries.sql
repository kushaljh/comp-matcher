-- ============================================================================
-- Comp Matcher — role moves from profiles to entries
-- ============================================================================
-- Until now a dancer WAS a leader or a follower: `profiles.role` was set at
-- onboarding and locked ("you can't switch between leader and follower later").
-- Real competitors lead one contest and follow another, and some enter the same
-- contest twice, once per role.
--
-- The original schema comment anticipated relaxing this by allowing a second
-- profile row per user. We do the opposite, and it is the cheaper change: the
-- dancer keeps ONE identity (name, photo, bio, values, contacts, competition
-- history entered once) and the ROLE moves onto the registration. A profile is
-- who you are; an entry is how you're competing.
--
-- Consequence: (profile, contest) is no longer unique — (profile, contest, role)
-- is. That ripples into swipes and matches, which both keyed on the assumption
-- that a pair of profiles in a contest could only relate one way. Each gains a
-- role column so a leader-side and a follower-side judgement of the same person
-- stay distinct rows.
--
-- Ordering matters in this file: every backfill reads `profiles.role`, so that
-- column is dropped last.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- other_role(): dance_role has exactly two values, so "the other one" is total.
-- IMMUTABLE so it can be used in index predicates and inlined by the planner.
-- Used by the deck function and the match trigger in the next migration.
-- ---------------------------------------------------------------------------
create or replace function public.other_role(r public.dance_role)
returns public.dance_role
language sql
immutable
set search_path = ''
as $$
  select case when r = 'leader' then 'follower' else 'leader' end::public.dance_role
$$;

grant execute on function public.other_role(public.dance_role) to authenticated;

-- ---------------------------------------------------------------------------
-- entries.role
--   Backfilled from the owner's profile: every existing entry was necessarily
--   at that dancer's single locked role, so this is lossless.
-- ---------------------------------------------------------------------------
alter table public.entries add column role public.dance_role;

update public.entries e
   set role = p.role
  from public.profiles p
 where p.id = e.profile_id;

alter table public.entries alter column role set not null;

-- A dancer may now hold two entries in one contest — one per role — but still
-- only one per (contest, role).
alter table public.entries drop constraint entries_profile_id_contest_id_key;
alter table public.entries add constraint entries_profile_contest_role_key
  unique (profile_id, contest_id, role);

-- The deck filters candidates by (contest, division, role).
drop index public.entries_contest_division_idx;
create index entries_contest_division_role_idx
  on public.entries (contest_id, division, role);

-- ---------------------------------------------------------------------------
-- swipes.swiper_role
--   Which role the swiper was competing as when they judged. The TARGET's role
--   is always the opposite (the deck only ever offers opposite-role candidates),
--   so one column captures both sides.
-- ---------------------------------------------------------------------------
alter table public.swipes add column swiper_role public.dance_role;

update public.swipes s
   set swiper_role = p.role
  from public.profiles p
 where p.id = s.swiper_profile_id;

alter table public.swipes alter column swiper_role set not null;

-- Without the role in this key, liking someone as a leader would block ever
-- judging them as a follower in the same contest.
alter table public.swipes
  drop constraint swipes_contest_id_swiper_profile_id_target_profile_id_key;
alter table public.swipes add constraint swipes_contest_swiper_target_role_key
  unique (contest_id, swiper_profile_id, target_profile_id, swiper_role);

drop index public.swipes_swiper_contest_idx;
create index swipes_swiper_contest_role_idx
  on public.swipes (swiper_profile_id, contest_id, swiper_role);

-- A dancer must actually hold an entry AT THE ROLE they are swiping as.
-- Without the role term here, a leader-only entrant could forge follower-side
-- swipes and manufacture a match the deck would never have offered them.
drop policy swipes_insert on public.swipes;
create policy swipes_insert on public.swipes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = swipes.swiper_profile_id
        and p.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.entries e
      where e.contest_id = swipes.contest_id
        and e.profile_id = swipes.swiper_profile_id
        and e.role       = swipes.swiper_role
    )
  );

-- ---------------------------------------------------------------------------
-- matches.profile_a_role
--   The pair is stored ordered (profile_a < profile_b), so recording profile_a's
--   role is enough: profile_b's is other_role(profile_a_role). Storing both
--   would let them disagree.
-- ---------------------------------------------------------------------------
alter table public.matches add column profile_a_role public.dance_role;

update public.matches m
   set profile_a_role = p.role
  from public.profiles p
 where p.id = m.profile_a;

alter table public.matches alter column profile_a_role set not null;

alter table public.matches
  drop constraint matches_contest_id_profile_a_profile_b_key;
alter table public.matches add constraint matches_contest_pair_role_key
  unique (contest_id, profile_a, profile_b, profile_a_role);

-- ---------------------------------------------------------------------------
-- profiles.role is now derivable per-entry and would only drift. Dropped LAST,
-- after every backfill above has read it.
-- ---------------------------------------------------------------------------
alter table public.profiles drop column role;
