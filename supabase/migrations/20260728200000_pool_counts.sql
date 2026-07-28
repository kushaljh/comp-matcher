-- ============================================================================
-- Comp Matcher — the Season's partner counts, computed the way the deck is
-- ============================================================================
--
-- The Season used to count partners client-side: every opposite-role entry in
-- the contest, straight off `entries`. get_deck counts a strictly smaller set —
-- it also drops you, everyone you have already swiped, and everyone you are
-- already paired with. So the card promised "2 leads in amateur" and the floor
-- dealt nothing, with no way to tell which of the three exclusions ate them.
--
-- This is the same query as get_deck's, aggregated instead of projected, so the
-- number on the card IS the number of cards the floor will deal.
--
-- Keyed on (contest, role) rather than an entry id the way get_deck is: the
-- Season draws a count on every division chip, including divisions the caller
-- has not entered and therefore holds no entry for. The swipe and match
-- exclusions are contest-scoped, not division-scoped, so they stay correct
-- across every division in the result.
--
-- security invoker + the auth.uid() join, matching get_deck: RLS applies, and
-- the counts are only ever the caller's own perspective.
-- ---------------------------------------------------------------------------

create function public.get_pool_counts(
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
  )
  select e.division, count(*)::integer as available
  from me
  join public.entries e
    on e.contest_id = p_contest_id
   and e.role       = public.other_role(p_role)
   and e.profile_id <> me.profile_id
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

grant execute on function public.get_pool_counts(uuid, public.dance_role) to authenticated;
