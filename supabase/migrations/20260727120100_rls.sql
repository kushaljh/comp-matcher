-- ============================================================================
-- Comp Matcher — Row Level Security, table/function GRANTs, and storage
-- ============================================================================
-- This migration is the entire client-facing access-control surface. The app's
-- core promise lives here:
--   * No one ever learns who swiped/rejected them  -> swipes readable only by
--     the swiper (there is no policy that lets a target read a swipe).
--   * Swipes and matches are invisible to third parties -> matches readable
--     only by their two members; no client write path to either table.
--
-- Design decision (hardening vs the literal spec): every policy is scoped
-- `TO authenticated`. The app is authenticated-only, and the default role for
-- an unauthenticated request is `anon`. Leaving policies `TO public` would, for
-- example, expose the full `entries` list (who is competing) to anonymous
-- callers. Scoping to `authenticated` keeps anon locked out of everything.
--
-- GRANTs: this project uses the new Supabase default (`auto_expose_new_tables`
-- unset) under which freshly-created objects are NOT auto-granted to the Data
-- API roles. Without the explicit GRANTs below, every PostgREST call would fail
-- with "permission denied for table" even though the RLS policies are correct.
-- We grant least privilege to `authenticated` (RLS then filters rows) and full
-- privilege to `service_role` (which also bypasses RLS, for admin/seed/fixtures).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Schema usage + table/function privileges for the API roles
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- authenticated: least privilege matching the intended operations per table.
grant select, insert, update          on public.profiles            to authenticated;
grant select, insert, update, delete  on public.profile_contacts    to authenticated;
grant select, insert, update, delete  on public.competition_history to authenticated;
grant select, insert                  on public.events              to authenticated;
grant select                          on public.contests            to authenticated;
grant select, insert, update, delete  on public.entries             to authenticated;
grant select, insert                  on public.swipes              to authenticated;   -- no update/delete: swipes are immutable
grant select                          on public.matches             to authenticated;   -- read-only; created by trigger only

-- service_role: full access (bypasses RLS) for seeding, fixtures, admin.
grant all on public.profiles, public.profile_contacts, public.competition_history,
             public.events, public.contests, public.entries, public.swipes, public.matches
  to service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table (default-deny once enabled)
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.profile_contacts    enable row level security;
alter table public.competition_history enable row level security;
alter table public.events              enable row level security;
alter table public.contests            enable row level security;
alter table public.entries             enable row level security;
alter table public.swipes              enable row level security;
alter table public.matches             enable row level security;

-- ===========================================================================
-- profiles: any authenticated user can read; write only your own row.
--   No DELETE policy — account deletion goes through delete_my_account().
-- ===========================================================================
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ===========================================================================
-- profile_contacts: readable by the owner OR by anyone the owner has matched
--   with (in ANY contest). All writes are owner-only.
-- ===========================================================================
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
      join public.profiles me on me.user_id = (select auth.uid())
      where (m.profile_a = me.id and m.profile_b = profile_contacts.profile_id)
         or (m.profile_b = me.id and m.profile_a = profile_contacts.profile_id)
    )
  );

create policy profile_contacts_insert on public.profile_contacts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_contacts.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_contacts_update on public.profile_contacts
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_contacts.profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_contacts.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_contacts_delete on public.profile_contacts
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_contacts.profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- competition_history: readable by any authenticated user; writes owner-only.
-- ===========================================================================
create policy competition_history_select on public.competition_history
  for select to authenticated
  using (true);

create policy competition_history_insert on public.competition_history
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = competition_history.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy competition_history_update on public.competition_history
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = competition_history.profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = competition_history.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy competition_history_delete on public.competition_history
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = competition_history.profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- events: approved events are visible to all authenticated users; a pending
--   event is visible only to its suggester. Inserts must be pending + self.
--   No user UPDATE/DELETE (approval happens with the service role).
-- ===========================================================================
create policy events_select on public.events
  for select to authenticated
  using (
    status = 'approved'
    or suggested_by = (select auth.uid())
  );

create policy events_insert on public.events
  for insert to authenticated
  with check (
    status = 'pending'
    and suggested_by = (select auth.uid())
  );

-- ===========================================================================
-- contests: visible iff the parent event is visible to the caller (approved,
--   or suggested by the caller). No user write policies (seeded/admin only).
-- ===========================================================================
create policy contests_select on public.contests
  for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = contests.event_id
        and (e.status = 'approved' or e.suggested_by = (select auth.uid()))
    )
  );

-- ===========================================================================
-- entries: any authenticated user can read (the candidate pool is not secret);
--   writes are limited to entries for your own profile.
-- ===========================================================================
create policy entries_select on public.entries
  for select to authenticated
  using (true);

create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = entries.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy entries_update on public.entries
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = entries.profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = entries.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy entries_delete on public.entries
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = entries.profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- swipes: PRIVACY-CRITICAL.
--   SELECT: only the swiper can read a swipe. There is deliberately NO way for
--           a target to read swipes aimed at them — this is what guarantees
--           "no one learns who rejected them".
--   INSERT: the swiper profile must belong to the caller AND the caller must
--           actually have an entry in that contest.
--   No UPDATE/DELETE policy (and no update/delete grant): swipes are immutable.
-- ===========================================================================
create policy swipes_select on public.swipes
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = swipes.swiper_profile_id
        and p.user_id = (select auth.uid())
    )
  );

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
    )
  );

-- ===========================================================================
-- matches: readable only by the two members. No client write path at all
--   (no insert/update/delete policy, and only SELECT granted) — matches are
--   created exclusively by the SECURITY DEFINER match trigger.
-- ===========================================================================
create policy matches_select on public.matches
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = matches.profile_a or p.id = matches.profile_b)
        and p.user_id = (select auth.uid())
    )
  );

-- Storage bucket + storage.objects policies live in the next migration
-- (20260727120150_storage.sql) so that, since each migration file is its own
-- transaction under `db push`, a storage.objects ownership hiccup on a hosted
-- project cannot roll back the core table RLS committed above.
