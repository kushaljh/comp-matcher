-- ============================================================================
-- Comp Matcher — withdrawing from a contest dissolves its pairings
-- ============================================================================
-- Matches reference (contest, profiles), not entries, so deleting an entry
-- used to leave the match visible to BOTH sides — a withdrawn dancer kept
-- appearing on their partners' dance cards. A trigger keeps this consistent
-- for every withdrawal path (The Season, Your Card, admin contest deletes go
-- via contest FK cascade already).
--
-- The withdrawer's OUTGOING swipes in that contest are cleared as well.
-- Rationale: if they re-enter later, their old swipes would hide everyone
-- they'd judged while the dissolved match could never re-form (the match
-- trigger only fires on INSERT). Clearing their outgoing swipes lets them
-- re-swipe; the other side's standing like remains, so a mutual pairing
-- re-forms the moment the returning dancer likes them again.
--
-- SECURITY DEFINER: clients have no DELETE grant on matches, and only a
-- pass-scoped DELETE on swipes — this cleanup must run with definer rights.
-- ============================================================================

create or replace function public.dissolve_withdrawn_pairings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.matches
  where contest_id = old.contest_id
    and (profile_a = old.profile_id or profile_b = old.profile_id);

  delete from public.swipes
  where contest_id = old.contest_id
    and swiper_profile_id = old.profile_id;

  return old;
end;
$$;

create trigger entries_dissolve_pairings
  after delete on public.entries
  for each row execute function public.dissolve_withdrawn_pairings();

-- Retroactive cleanup: dissolve matches whose members no longer hold an entry
-- in the match's contest (withdrawals that happened before this trigger).
delete from public.matches m
where not exists (
    select 1 from public.entries e
    where e.contest_id = m.contest_id and e.profile_id = m.profile_a
  )
   or not exists (
    select 1 from public.entries e
    where e.contest_id = m.contest_id and e.profile_id = m.profile_b
  );
