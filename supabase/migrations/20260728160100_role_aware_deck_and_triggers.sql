-- ============================================================================
-- Comp Matcher — role-aware deck, match trigger, and withdrawal cleanup
-- ============================================================================
-- Companion to 20260728160000_role_on_entries.sql. That migration added the
-- role columns; this one teaches the three functions that read them.
--
-- The through-line: every one of these used to identify a relationship by
-- (contest, profile) or (contest, profile-pair). Now that a dancer can hold two
-- entries in one contest, that key is ambiguous and each function has to say
-- WHICH role it means.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- handle_new_swipe(): a mutual like only counts when the two sides were
-- competing as OPPOSITE roles.
--
-- Without the role term, Alice-as-leader liking Bob and Bob-as-leader liking
-- Alice would create a match between two leaders — a pairing that can't dance.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_swipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      uuid;
  b      uuid;
  a_role public.dance_role;
begin
  if new.direction <> 'like'::public.swipe_direction then
    return new;
  end if;

  -- Did the target already like the swiper back, from the opposite role?
  if exists (
    select 1
    from public.swipes s
    where s.contest_id        = new.contest_id
      and s.swiper_profile_id = new.target_profile_id
      and s.target_profile_id = new.swiper_profile_id
      and s.direction         = 'like'::public.swipe_direction
      and s.swiper_role       = public.other_role(new.swiper_role)
  ) then
    -- Store the pair ordered so (a, b) is canonical, and record the role of
    -- whichever profile sorts first — b's is always the other one.
    if new.swiper_profile_id < new.target_profile_id then
      a      := new.swiper_profile_id;
      b      := new.target_profile_id;
      a_role := new.swiper_role;
    else
      a      := new.target_profile_id;
      b      := new.swiper_profile_id;
      a_role := public.other_role(new.swiper_role);
    end if;

    insert into public.matches (contest_id, profile_a, profile_b, profile_a_role)
    values (new.contest_id, a, b, a_role)
    on conflict (contest_id, profile_a, profile_b, profile_a_role) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- dissolve_withdrawn_pairings(): withdrawing ONE entry must not dissolve the
-- other one's pairings.
--
-- The previous version deleted every match and swipe for (contest, profile).
-- A dancer entered in both roles who withdraws as a leader would silently lose
-- their follower matches too — data loss with no way back, since the match
-- trigger only fires on INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.dissolve_withdrawn_pairings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the matches the withdrawn entry's role actually produced. The
  -- withdrawer is profile_a in some rows and profile_b in others, and
  -- profile_a_role is stored from a's perspective, so b's side is the inverse.
  delete from public.matches
  where contest_id = old.contest_id
    and (
      (profile_a = old.profile_id and profile_a_role = old.role)
      or
      (profile_b = old.profile_id and profile_a_role = public.other_role(old.role))
    );

  -- Likewise their outgoing judgements at that role only, so re-entering lets
  -- them re-swipe that side while the other role's history stays intact.
  delete from public.swipes
  where contest_id        = old.contest_id
    and swiper_profile_id = old.profile_id
    and swiper_role       = old.role;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_deck(p_entry_id): swipeable candidates for ONE of the caller's entries.
--
-- Signature change from get_deck(p_contest_id): a contest id no longer
-- identifies a deck, because the caller may hold two entries there. The entry
-- id pins contest + division + role in a single argument, and joining it back
-- to the caller's profile proves ownership — you cannot deal someone else's
-- deck by passing their entry id.
--
-- Still SECURITY INVOKER: everything it reads is already visible to the caller
-- under RLS (public entries/profiles plus their own swipes and matches).
-- ---------------------------------------------------------------------------
drop function if exists public.get_deck(uuid);

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
    e.note
  from me
  join public.entries e
    on e.contest_id = me.contest_id
   and e.division   = me.division
   and e.role       = public.other_role(me.role)
   and e.profile_id <> me.profile_id     -- never show the caller themselves,
                                         -- including their own other-role entry
  join public.profiles p
    on p.id = e.profile_id
  where not exists (              -- not already judged BY THE CALLER AT THIS ROLE
    select 1
    from public.swipes s
    where s.contest_id        = me.contest_id
      and s.swiper_profile_id = me.profile_id
      and s.target_profile_id = p.id
      and s.swiper_role       = me.role
  )
  and not exists (                -- not already paired AT THIS ROLE
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

grant execute on function public.get_deck(uuid) to authenticated;
