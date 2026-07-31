-- ============================================================================
-- Comp Matcher — Grandfathered members did not all join this week
-- ============================================================================
-- 20260729120000_invite_only.sql backfilled app_members from auth.users with
--   insert into public.app_members (user_id) select id from auth.users
-- which let joined_at fall to its `default now()`. So every account that
-- predates invite-only is recorded as having joined at the moment the
-- migration ran, and the admin overview's "joined this week" counted the
-- entire membership.
--
-- The honest value is when the account was actually created. Only correct the
-- rows the backfill touched — a member who has since joined through an invite
-- has a real joined_at, and the two can be told apart because the backfill
-- left invite_id null AND set joined_at within a second of the migration.
-- Narrower still: only move joined_at BACKWARDS, so nothing invented later
-- can be dragged around by this.
-- ============================================================================

update public.app_members m
   set joined_at = u.created_at
  from auth.users u
 where u.id = m.user_id
   and m.invite_id is null
   and m.invited_by is null
   and u.created_at < m.joined_at;
