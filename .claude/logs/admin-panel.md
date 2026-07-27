# Admin panel

Owner: admin-panel agent, worktree `comp_matcher-wp2`, branch `admin-panel`.
Scope: replacing the "owner edits rows in the Supabase dashboard" event
approval workflow with an in-app admin panel — the migration, a grant-admin
script, the admin UI, and a live-verification script. Did not touch frozen
files (`package.json`/`pnpm-lock.yaml`, `.npmrc`, `app.json`, `tsconfig.json`,
`babel.config.js`, `lib/**`, `theme/**`, `app/_layout.tsx`,
`app/(tabs)/_layout.tsx`, `app/index.tsx`, existing `scripts/*`, other
`features/**`). Did **not** run `supabase db push` or any DDL against the
live DB.

---

## Scope delivered

**Migration** (`supabase/migrations/20260728100000_admin.sql`): `admin_users`
allow-list table (RLS: own-row SELECT only, no user-facing writes) + additive
RLS policies letting admins SELECT/UPDATE/DELETE on `events` and
INSERT/UPDATE/DELETE on `contests`, plus the matching least-privilege GRANTs.

**`scripts/grant-admin.mjs <email>`**: service-role script, looks up the auth
user by email (paginated `admin.listUsers`, same helper shape as
`create-fixtures.mjs`), upserts their `admin_users` row, prints confirmation.
Non-zero exit with a clear message if the email has no matching auth user.

**UI**: `features/admin/` (`api.ts`, `hooks.ts`, `PendingEventCard.tsx`,
`ApprovedEventCard.tsx`), `app/(tabs)/profile/admin.tsx`, a new
`app/(tabs)/profile/_layout.tsx`, and a minimal edit to
`app/(tabs)/profile/index.tsx` (an "Admin" button, rendered only when
`isAdmin` is true).

**`scripts/verify-admin.mjs`**: live verification against the (currently
unmigrated) hosted DB — see "Verification" below for the actual run.

---

## Policy decisions

- **No SECURITY DEFINER helper function for "is this caller an admin?"**
  Every admin policy uses a plain `exists (select 1 from public.admin_users a
  where a.user_id = (select auth.uid()))` inline. This is safe/non-recursive
  specifically because the subquery only ever asks "is *my own* uid in
  admin_users?", and `admin_users`' own SELECT policy (`user_id =
  auth.uid()`) already permits exactly that self-lookup — so the EXISTS check
  resolves correctly under RLS with no elevated-privilege function needed.
  This was the task brief's own suggested design and I didn't second-guess it
  — it's simpler than a helper function for a single-column allow-list.
- **Additive-only on `events`/`contests`.** The original
  `events_select`/`events_insert` and `contests_select` policies from
  `20260727120100_rls.sql` are byte-for-byte untouched. New policies
  (`events_admin_select/update/delete`, `contests_admin_insert/update/delete`)
  are pure additions — Postgres ORs multiple permissive policies for the same
  command together, so a non-admin's existing access is unchanged and the
  suggester-forced-`'pending'` insert path is not weakened.
- **New GRANTs for `authenticated`** (`update, delete` on `events`;
  `insert, update, delete` on `contests`) are required for the new admin
  policies to have any effect at all, per this project's established
  least-privilege GRANT pattern (RLS filters rows; the GRANT gates the
  operation at the SQL level for everyone, admin or not). Non-admins get the
  grant too, exactly like the pattern already used for `select`/`insert` — an
  attempted write from a non-admin is stopped by RLS (UPDATE: silently
  affects 0 rows; INSERT: explicit RLS-violation error; DELETE: silently
  affects 0 rows), not by a missing grant.
- **`WITH CHECK` parent-event-exists on `contests` admin insert/update.** The
  `event_id` FK already enforces this at the constraint level, but the spec
  asked for it explicitly at the RLS layer too, so both `contests_admin_insert`
  and `contests_admin_update` also assert `exists (select 1 from public.events
  e where e.id = contests.event_id)`.
- **No extra admin policies on `entries`/`swipes`/`matches`.** Rejecting an
  event or deleting a contest cascades to these via the existing `ON DELETE
  CASCADE` FKs. Postgres referential-integrity cascade actions always bypass
  RLS on the referencing table (this is documented Postgres RLS behavior, not
  an assumption), so no additional policy is needed for those cascades to
  actually happen when an admin (who otherwise has no read/write policy on
  `entries`/`swipes`) deletes the parent row.
- **Admin grants are not self-service by design**: `admin_users` has a SELECT
  policy only. Becoming an admin requires the service role
  (`scripts/grant-admin.mjs`) or direct SQL — never a client-side write path.
- **`features/admin/api.ts` owns its own reads**, including "approved events"
  and "contests for an event," rather than importing
  `features/events/hooks.ts`'s `useApprovedEvents`/`useContestsForEvent`.
  Two reasons: (1) the task brief explicitly lists "list contests per event"
  as part of `features/admin/api.ts`'s job, and (2) the admin's own approved-
  events read is deliberately **not** filtered to `end_date >= today` the way
  the public Events tab's version is — an admin may need to manage contests
  on an approved event that has already ended, so reusing the public,
  upcoming-only query would silently hide it from the panel. Despite the
  separate read, `useApproveEvent`/`useRejectEvent`/`useAddContest`/
  `useDeleteContest` all invalidate the **exact** query keys
  `features/events/hooks.ts` uses (`['events', 'approved']` and
  `['contests', 'byEvent', eventId]`) so the public Events tab reflects admin
  actions immediately, per the task brief's instruction.
- **Added `app/(tabs)/profile/_layout.tsx`** (a `Stack`, `headerShown:
  false`), matching `app/(tabs)/events/_layout.tsx`'s exact pattern. Not in
  the frozen list (only the top-level `app/(tabs)/_layout.tsx` is), and
  necessary: `profile/` previously had only `index.tsx` (a single screen, no
  layout needed); adding a second screen (`admin.tsx`) needs a stack so
  routing works and so `admin.tsx` gets the same "no native header, build
  your own back link" treatment as every other pushed screen in this app.
- **Inline-confirm pattern, not `confirmAsync`/`Alert.alert`.** The task
  brief explicitly pointed at `ContestCard.tsx`'s established
  pattern (a local `useState` toggle rendering an inline Confirm/Cancel row)
  for Reject and Delete-contest, rather than `features/profile/confirm.ts`'s
  `window.confirm`/`Alert.alert` branch used elsewhere in the app. Both
  exist in the codebase; I followed the one the brief named.
- **Divisions multi-select** uses `Constants.public.Enums.division` from
  `lib/database.types.ts` (already frozen/available), not a hand-rolled list.

---

## Files

New:
- `supabase/migrations/20260728100000_admin.sql`
- `scripts/grant-admin.mjs`
- `scripts/verify-admin.mjs`
- `features/admin/api.ts`, `hooks.ts`, `PendingEventCard.tsx`, `ApprovedEventCard.tsx`
- `app/(tabs)/profile/_layout.tsx`
- `app/(tabs)/profile/admin.tsx`
- `.claude/logs/admin-panel.md` (this file)

Modified (minimal, in-scope per the task brief):
- `app/(tabs)/profile/index.tsx` — added an "Admin" button, shown only when
  `useIsAdmin()` is true, navigating to `/profile/admin`.

---

## Verification

### `npx tsc --noEmit`
Exit code 0, zero errors.

### `npx expo export --platform web`
Succeeded (`dist/` gitignored, not committed). Confirms the new route
registered correctly:
```
Static routes (27):
...
/profile/admin (19KB)
...
/(tabs)/profile/admin (19KB)
...
Exported: dist
```

### `node scripts/verify-admin.mjs` (live DB, migration NOT yet applied)
```
--- setup: throwaway users (owner/nonadmin/suggester) ---
setup complete: owner=0d655d76-798b-489e-bc0e-cf9a7f9134c3 nonadmin=a9784730-74d8-40c6-b31b-05ce35f989c0 suggester=4bbf0103-7378-400d-8cf4-fda83b401fc1
setup: created pending event d10afcaf-2ae1-4446-a40b-25c778c46a28 (suggested by suggester)

--- as non-admin (pre-existing RLS, independent of the admin migration) ---
PASS: non-admin can query events (not necessarily see this one)
PASS: non-admin cannot read another user's pending event
PASS: non-admin cannot change an event's status
PASS: non-admin cannot INSERT a contest

--- admin-dependent setup: grant `owner` admin access (service role) ---
EXPECTED-FAIL (migration not applied yet): granting admin via admin_users — Could not find the table 'public.admin_users' in the schema cache
Skipping all remaining admin-dependent checks (admin_users does not exist yet).

--- cleanup ---
  deleted any events/contests created by this run
  deleted throwaway user owner
  deleted throwaway user nonadmin
  deleted throwaway user suggester

ALL CHECKS PASSED
EXIT_CODE=0
```
Behaves exactly as specified: the four non-admin checks that depend only on
the ORIGINAL (already-live) events/contests RLS run for real and pass; the
first admin-dependent step (granting admin via a service-role insert into
`admin_users`) hits the expected missing-relation condition, is reported as a
distinguishable `EXPECTED-FAIL` line (not silently swallowed, not counted as
a real pass), remaining admin-only checks are skipped as not meaningful
without the table, cleanup runs in `finally` regardless, and the process
exits 0. No unexpected failures occurred. Once the migration lands, re-running
this exact, unmodified script should produce zero `EXPECTED-FAIL` lines and a
full `ALL CHECKS PASSED` covering all 9 numbered assertions in the script's
header comment.

---

## For the orchestrator

Once you've reviewed `supabase/migrations/20260728100000_admin.sql`, apply it
and confirm end-to-end with:

```sh
# 1. Apply the migration
supabase db push

# 2. Grant yourself (or whoever should own approvals) admin access
node scripts/grant-admin.mjs your-email@example.com

# 3. Re-run the SAME, unmodified verification script — expect full PASS,
#    zero EXPECTED-FAIL lines, exit 0
node scripts/verify-admin.mjs
```

### `lib/database.types.ts` snippet to fold in

Add this entry to `Database['public']['Tables']` (alphabetically first,
before `competition_history`, matching the file's existing ordering):

```ts
admin_users: {
  Row: {
    created_at: string
    user_id: string
  }
  Insert: {
    created_at?: string
    user_id: string
  }
  Update: {
    created_at?: string
    user_id?: string
  }
  Relationships: []
}
```

(`Relationships: []` matches this file's existing convention for
cross-schema FKs into `auth.users` — see `profiles.user_id`, which has the
same shape of FK and an empty `Relationships` array.)

Once folded in, `features/admin/api.ts`'s `supabase.from('admin_users' as
any)` cast (and its local `AdminUserRow` type) can be replaced with the
normal typed `supabase.from('admin_users')` / `Tables<'admin_users'>` — that
cast is intentionally contained to the one `fetchIsAdmin()` function in that
file, per the task brief, so this is a one-line follow-up.

---

## git status

Clean after the final commit on `admin-panel` (five commits: migration,
grant-admin script, admin UI, verify-admin script, this log).
