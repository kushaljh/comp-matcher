-- ============================================================================
-- Comp Matcher — Admin panel: admin_users table + admin RLS extensions
-- ============================================================================
-- Replaces the "owner edits rows in the Supabase dashboard" approval workflow
-- with an in-app admin panel. Adds:
--   1. admin_users — a plain allow-list of admin auth users.
--   2. Additive RLS policies on events/contests granting admins (and ONLY
--      admins) the approve/reject/contest-management capabilities the panel
--      needs, without touching any existing user-facing policy.
--
-- Design decision: admin status is checked with a plain EXISTS subquery
-- against admin_users directly in every admin policy below — no SECURITY
-- DEFINER helper function. This is safe and non-recursive because every such
-- subquery is shaped `where a.user_id = (select auth.uid())`: it only ever
-- asks "is *my own* uid in admin_users?", and admin_users' own-row SELECT
-- policy (below) already permits exactly that self-lookup. A helper function
-- would add a moving part for no benefit here.
--
-- Admin grants are DELIBERATELY not self-service: there is no INSERT/UPDATE/
-- DELETE policy on admin_users for any authenticated role. The only way to
-- become an admin is `scripts/grant-admin.mjs` (service role, bypasses RLS)
-- or a direct SQL statement — i.e. a human with service-role/DB access.
--
-- Cascade note: admins DELETE events (reject) and contests. Both tables have
-- existing FK ON DELETE CASCADE children: deleting an event cascades to its
-- contests; deleting a contest cascades to its entries, swipes, AND matches
-- (matches.contest_id also references contests ON DELETE CASCADE). Postgres
-- referential-integrity cascade actions always bypass RLS, so no additional
-- admin policy is needed on entries/swipes/matches for these deletes to
-- cascade correctly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Own-row read only — lets the app ask "am I an admin?" without exposing the
-- full admin roster to every authenticated user. No insert/update/delete
-- policy: grants happen only via service role / SQL (see header).
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.admin_users to authenticated;
grant all    on public.admin_users to service_role;

-- ===========================================================================
-- events: additive admin policies. The existing events_select/events_insert
--   policies (20260727120100_rls.sql) are untouched — the suggester-forced-
--   'pending' insert path is not weakened. Postgres OR's multiple permissive
--   policies for the same command together, so these purely ADD capability
--   for admins on top of the existing user policies.
-- ===========================================================================

-- Admins can see every event, including everyone else's pending suggestions
-- (needed for the "pending events" review queue).
create policy events_admin_select on public.events
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

-- Approve (flip status to 'approved') or otherwise edit any event.
create policy events_admin_update on public.events
  for update to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

-- Reject (delete) a pending event.
create policy events_admin_delete on public.events
  for delete to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

-- Non-admins keep select/insert only (unchanged). Admins additionally need
-- update/delete GRANTs at the SQL level for the policies above to take
-- effect at all (RLS still restricts actual rows to admins only) — this
-- mirrors the least-privilege GRANT pattern from 20260727120100_rls.sql.
grant update, delete on public.events to authenticated;

-- ===========================================================================
-- contests: additive admin write policies. The existing contests_select
--   policy is untouched; non-admins remain read-only (no insert/update/
--   delete grant or policy is added for them).
-- ===========================================================================

-- Add a contest to an event. The event_id FK already guarantees the parent
-- event exists at the constraint level; the explicit exists() here matches
-- the "WITH CHECK the parent event exists" requirement as an RLS-level
-- assertion, not just a DB constraint.
create policy contests_admin_insert on public.contests
  for insert to authenticated
  with check (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.events e
      where e.id = contests.event_id
    )
  );

create policy contests_admin_update on public.contests
  for update to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.events e
      where e.id = contests.event_id
    )
  );

-- Delete a contest (cascades to entries/swipes/matches via existing FKs; see
-- header note on why no additional admin policy is needed on those tables).
create policy contests_admin_delete on public.contests
  for delete to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

grant insert, update, delete on public.contests to authenticated;
