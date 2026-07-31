-- ============================================================================
-- Comp Matcher — who you passed on, so a cleared floor isn't a dead end
-- ============================================================================
--
-- get_deck hides everyone you have swiped, which is right while you are
-- dealing but leaves "That's the whole floor" looking emptier than the contest
-- actually is: the dancers you passed early, before you had a feel for the
-- field, are gone with no way back. The deck's undo only reaches the last pass
-- of the current session and forgets on reload.
--
-- This is get_deck's query with the swipe test inverted — same columns, so the
-- client renders these with the same card shape.
--
-- Joined to swipes rather than testing EXISTS so the list can come back
-- most-recently-passed first; the (contest, swiper, target, role) unique key on
-- swipes means that join can't duplicate a candidate.
--
-- No matches exclusion, deliberately: a match needs likes from both sides, and
-- liking replaces the pass row for this (contest, role). A candidate with a
-- pass row on record therefore cannot also be paired with the caller.
--
-- security invoker + the auth.uid() join, matching get_deck: you can only ever
-- list your own passes, which is also all swipes_select would return.
-- ---------------------------------------------------------------------------

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
  -- Still entered, still in the caller's division and the opposite role: a
  -- dancer who has since withdrawn or moved division can't be dealt again, so
  -- offering them back would be a promise the deck could not keep.
  join public.entries e
    on e.contest_id = me.contest_id
   and e.division   = me.division
   and e.role       = public.other_role(me.role)
   and e.profile_id = s.target_profile_id
  join public.profiles p
    on p.id = e.profile_id
  order by s.created_at desc;
$$;

grant execute on function public.get_passed(uuid) to authenticated;
