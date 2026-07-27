-- ============================================================================
-- Comp Matcher — undo a pass (redesign feature "Take back a pass")
-- ============================================================================
-- The redesign lets a dancer retract their most recent PASS so that card
-- returns to the deck. Likes stay irrevocable from the floor (the other side
-- may already have seen a match; the design surfaces a notice instead).
--
-- Privacy: unchanged. A dancer can only delete their OWN swipe rows, and only
-- pass rows — so nobody can un-create a match by deleting a like, and the
-- "nobody can read swipes about them" guarantee is untouched (this adds a
-- DELETE capability, not any read path).
-- ============================================================================

create policy swipes_delete_own_pass on public.swipes
  for delete to authenticated
  using (
    direction = 'pass'
    and exists (
      select 1 from public.profiles p
      where p.id = swiper_profile_id
        and p.user_id = (select auth.uid())
    )
  );

grant delete on public.swipes to authenticated;
