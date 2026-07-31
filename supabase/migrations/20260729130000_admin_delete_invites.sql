-- ============================================================================
-- Comp Matcher — Admins can delete any invite
-- ============================================================================
-- 20260729120000_invite_only.sql gave members an owner-scoped delete
-- (invites_delete: `created_by = auth.uid() and redeemed_by is null`) so they
-- could take back a code they had not handed out yet. That leaves an admin
-- unable to clean up anyone else's codes, which is the wrong shape for the
-- admin panel: an organiser who spots a code circulating where it should not
-- be has no way to kill it.
--
-- This is additive, in the style of the admin policies in
-- 20260728100000_admin.sql — Postgres ORs permissive policies for the same
-- command together, so invites_delete is untouched and members keep exactly
-- the capability they had.
--
-- Deliberately NOT restricted to unredeemed rows, unlike the member policy.
-- An admin deleting a claimed invite is deleting a RECORD, not access:
-- app_members.invite_id is ON DELETE SET NULL, so the member stays a member
-- and keeps their invited_by attribution. The admin UI says so at the point
-- of deletion — removing someone is what the suspend flow is for, not this.
-- ============================================================================

create policy invites_admin_delete on public.invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );
