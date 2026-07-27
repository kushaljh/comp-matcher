# Stage 0b — Database & Privacy Model

Owner: 0b-database agent. Scope: everything under `supabase/`, `scripts/`, and
this log. I did **not** touch the Expo app files, `package.json`, or anything
the parallel scaffold agent owns. No git commands were run.

The app's core promise — **no one ever learns who rejected them, and
swipes/matches are invisible to third parties** — is enforced entirely by the
RLS in these migrations. This log ends with a per-policy self-review against
that promise and the exact commands the join step runs to verify it live
(I cannot run SQL here: no Docker, no hosted project yet).

---

## Deliverables (complete file list)

| File | Purpose |
|------|---------|
| `supabase/config.toml` | Created by `npx supabase init` (project_id `comp_matcher`, PG 17). Unmodified. |
| `supabase/migrations/20260727120000_schema.sql` | Enums, tables, constraints, indexes, entry-division validation trigger. |
| `supabase/migrations/20260727120100_rls.sql` | Role GRANTs + `enable row level security` + all table policies. |
| `supabase/migrations/20260727120150_storage.sql` | `profile-photos` bucket + `storage.objects` policies (own migration = own txn). |
| `supabase/migrations/20260727120200_match_trigger.sql` | `handle_new_swipe()` SECURITY DEFINER + AFTER INSERT trigger. |
| `supabase/migrations/20260727120300_functions.sql` | `get_my_profile_id()`, `get_deck(uuid)` (SECURITY INVOKER). |
| `supabase/migrations/20260727120400_delete_account.sql` | `delete_my_account()` SECURITY DEFINER, authenticated-only. |
| `supabase/seed.sql` | 3 approved events + their contests, fixed UUIDs. |
| `supabase/tests/rls_tests.sql` | 6 privacy assertions in one BEGIN…ROLLBACK txn; prints `ALL RLS TESTS PASSED`. |
| `scripts/create-fixtures.mjs` | Idempotent ESM script → 4 confirmed test users + profiles/contacts/history/entries. |

---

## Key decisions & why

### The GRANT that makes or breaks the whole app
`config.toml` leaves `auto_expose_new_tables` **unset**, which is the new
Supabase cloud default: freshly-created objects are **not** auto-granted to the
Data API roles (`anon`, `authenticated`, `service_role`). RLS only *restricts*
rows — it does nothing if the role has no table-level privilege at all. Without
explicit GRANTs every PostgREST call would fail with `permission denied for
table` even though the policies are perfect. So `20260727120100_rls.sql`:
- grants **least privilege** to `authenticated` per table (e.g. `swipes` gets
  only SELECT+INSERT — no UPDATE/DELETE; `matches` gets only SELECT), and
- grants `all` to `service_role` (for seeding/fixtures/admin; it also bypasses RLS),
- grants nothing to `anon` (the app is authenticated-only).

Explicit grants run *after* each `create table`, so even if the platform's
"revoke on new object" event trigger fires at creation, my grants are the final
word.

### Every policy is scoped `TO authenticated` (hardening vs literal spec)
The spec lists predicates without role clauses. Left `TO public`, the literal
`entries` SELECT `using (true)` would expose the full "who is competing" list to
**anonymous** callers, and approved `events`/`contests` too. Since the product
is authenticated-only and the default unauthenticated role is `anon`, I scoped
every policy `TO authenticated`. This strengthens (never weakens) the privacy
promise. The one deliberate exception is the storage **public read** policy
(`TO public`), which matches the public-bucket MVP tradeoff below.

### SECURITY DEFINER functions all pin `search_path = ''`
`handle_new_swipe`, `validate_entry_division`, and `delete_my_account` run as
owner, so they pin an empty `search_path` and schema-qualify every object
(`public.*`, `auth.*`, `storage.*`) to prevent search-path hijacking. The two
read functions (`get_deck`, `get_my_profile_id`) are SECURITY **INVOKER** on
purpose — the deck only needs data the caller may already see, so RLS should
apply normally; no escalation.

### Match creation must be DEFINER
`handle_new_swipe` is SECURITY DEFINER because detecting a mutual like requires
reading the *other* user's swipe — which the current user cannot see under RLS
(swipes are swiper-only). The definer reads both swipes, inserts the ordered
`matches` row `on conflict do nothing`, and never leaks the other swipe to the
client. Clients have **no** write path to `matches` (no policy + SELECT-only grant).

### Entry-division validation is DEFINER
`validate_entry_division` reads `public.contests` as owner so validation is
correct regardless of the caller's RLS visibility of the contest (authenticated
user *or* the service_role during seeding). It only validates — it never returns
contest data — so it widens no read surface.

### `values` column is quoted
`values` is a reserved SQL keyword, so it is written `"values"` in all DDL/DDL
references. The actual column name is still `values`; PostgREST/JS see `values`.

### Deviations from the spec (all documented)
1. **All policies `TO authenticated`** (+ storage read `TO public`) — hardening, above.
2. **Explicit GRANTs added** — required by the `auto_expose_new_tables` default; not in the spec but the app is non-functional without them.
3. **Storage split into its own migration** (`…120150_storage.sql`) so a
   `storage.objects` ownership quirk on a hosted project can't roll back the core
   table RLS (each migration file = its own transaction under `db push`).
4. **`competition_history.event_name / year / contest_name` are `NOT NULL`**
   (spec typed them as plain columns, only marking `placement` NULL). A history
   row is meaningless without them. `placement` stays nullable.
5. **`contests` non-empty CHECK uses `cardinality(divisions) > 0`**, not
   `array_length(...) >= 1` — `array_length('{}',1)` returns NULL, which would
   silently pass the CHECK.
6. Trigger/function names are my own (spec didn't mandate names).

### Storage tradeoff (revisit before public launch)
`profile-photos` bucket is **public** (`public = true` + a `TO public` SELECT
policy). Photo objects are world-readable via their public URL; object paths are
somewhat unguessable but that is not real access control. Writes are locked to a
per-user folder (`name like '<auth.uid()>/%'`). Before a public launch, move to a
private bucket + signed URLs. Logged as agreed.

### Seed / fixtures notes for Kushal
- `seed.sql` event **dates and URLs are plausible placeholders** — please curate
  the real dates and official links before launch. All three events are `status
  = 'approved'` with fixed UUIDs.
- Fixture contest the tests rely on:
  `California Balboa Classic / "Strictly Balboa"` =
  `b2222222-0000-4000-8000-000000000001` (offers novice+amateur+advanced+open).
- Fixtures create `leader1`+`follower1` (novice, that contest → can mutual-match),
  `leader2` (advanced, same contest → wrong division, must not appear in
  follower1's deck), `follower2` (novice, `Strictly Lindy` → wrong contest).
  Password for all fixture users: `Fixture123!`.

---

## Self-review: each policy vs the privacy promise

**Promise A — "no one learns who rejected (or liked) them."**
- `swipes` SELECT policy authorizes a row **only when the caller owns the
  swiper** profile. There is deliberately **no** clause that lets a *target*
  read a swipe aimed at them. A `pass` targeting A is invisible to A; a `like`
  targeting A is invisible to A until A likes back and a `matches` row appears.
  ✅ RLS test 1 asserts A sees 0 swipes targeting A and 0 swipes made by B.
- `swipes` has SELECT+INSERT grant only and no UPDATE/DELETE policy → swipes are
  immutable and unreadable by targets. ✅
- `get_deck` reads swipes as INVOKER, so it too can only see the caller's own
  swipes — it can't leak the existence of others' swipes. ✅

**Promise B — "swipes and matches are invisible to third parties."**
- `matches` SELECT policy authorizes a row only when the caller owns
  `profile_a` **or** `profile_b`. A third party sees nothing. ✅ (RLS test 2
  exercises the member-visible side; a non-member has neither profile id.)
- `matches` has **no** INSERT/UPDATE/DELETE policy and only a SELECT grant →
  the only writer is the DEFINER trigger. ✅ RLS test 5 asserts a direct client
  insert into `matches` fails (sqlstate 42501).

**Contact reveal is gated on a real match.**
- `profile_contacts` SELECT = owner **OR** a `matches` row exists between the
  caller's profile and the contact owner (any contest). Referenced-table RLS on
  `matches` only narrows this further (to matches the caller belongs to), which
  is consistent, and there is no policy recursion (leaves are `using(true)`).
  ✅ RLS test 2: A sees 0 of B's contacts while unmatched, exactly 2 after a
  match row is created.

**Swipe integrity.**
- `swipes` INSERT WITH CHECK requires the swiper profile to belong to the caller
  **and** the caller to have an entry in that contest → you can't swipe as
  someone else, and can't swipe in a contest you didn't enter. ✅ RLS test 4
  asserts a foreign-swiper insert fails with 42501.

**Event moderation.**
- `events` SELECT = approved OR your own suggestion; INSERT WITH CHECK forces
  `status='pending' AND suggested_by = auth.uid()`; no user UPDATE/DELETE (only
  SELECT+INSERT granted) → users can't self-approve or edit others' events.
  ✅ RLS test 3 (approved visible, pending invisible to non-suggester, visible
  to suggester, anon sees nothing). `contests` follow their parent event's
  visibility.

**Deck correctness (opposite role · same division · same contest · not swiped ·
not matched).** ✅ RLS test 6: as A (leader/novice) the deck is exactly {B}
(follower/novice); C (advanced) and D (leader) are excluded; after A likes B, B
drops out. Zero rows if the caller has no entry in the contest.

**Storage writes are per-user.** INSERT/UPDATE/DELETE on `storage.objects` are
restricted to `bucket_id='profile-photos' AND name LIKE '<auth.uid()>/%'`. A
uuid has no LIKE metacharacters, so the prefix match is safe. ✅ (not covered by
the SQL test file; verify by upload attempt — see checklist).

**Account deletion.** `delete_my_account()` is DEFINER, keyed solely to
`auth.uid()`, deletes the caller's storage objects + profile (cascades children,
incl. swipes as swiper **and** target, and matches) + `auth.users` row.
EXECUTE granted to `authenticated` only; revoked from `public`/`anon`. ✅

**Residual risks / things I could not execute here**
- I could not run any SQL (no Docker/hosted project). Every statement is
  reviewed by hand; the live steps below are the actual gate.
- `CREATE POLICY` on `storage.objects` assumes `postgres` may manage storage
  policies on the target project (true on local + standard hosted). Fallback in
  the storage migration header if a project rejects it.
- `rls_tests.sql` inserts bare `auth.users` rows; if a specific GoTrue schema
  version has a NOT NULL column without a default beyond what I set (id, aud,
  role, email, created_at, updated_at), add that column to the two inserts.
- The tests require a **Supabase** Postgres (they use `auth`/`storage` schemas,
  `auth.uid()`, and the `anon`/`authenticated` roles) — not a vanilla PG.

---

## Deferred live verification (run by the join step, once `.env` has real keys)

Two supported paths. **Local (recommended, free, needs Docker)** or **hosted**.

### A) Local via Supabase CLI + Docker
```bash
# 1. Start local stack (applies migrations + seed on reset)
npx supabase start
npx supabase db reset            # re-applies all migrations then supabase/seed.sql

# 2. Point .env at the local stack (values printed by `supabase start`):
#    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#    SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`>
#    SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 3. Create the 4 test users + their data (needs app deps installed: npm install)
node scripts/create-fixtures.mjs

# 4. Run the privacy test suite — must end with: ALL RLS TESTS PASSED
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql

# 5. Generate typed client for the app (join/app agent decides the output path)
npx supabase gen types typescript --local --schema public > <app>/lib/database.types.ts
```

### B) Hosted project
```bash
# 1. Link and push migrations to the remote database
npx supabase link --project-ref YOUR-PROJECT-REF     # prompts for DB password
npx supabase db push                                 # applies all migrations

# 2. Seed is NOT auto-run on push — apply it explicitly
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

# 3. Fixtures (uses EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env)
node scripts/create-fixtures.mjs

# 4. Privacy tests — must end with: ALL RLS TESTS PASSED
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql

# 5. Typed client
npx supabase gen types typescript --linked --schema public > <app>/lib/database.types.ts
```

### Manual storage spot-check (not in the SQL suite)
As a signed-in fixture user, upload `profile-photos/<their-uid>/avatar.jpg`
(should succeed) and `profile-photos/<other-uid>/x.jpg` (should be denied by the
`profile_photos_insert_own` policy). Confirm the object is publicly reachable via
its public URL (documents the MVP tradeoff).

### Success criteria for the gate
- `supabase db push` / `db reset` applies all 6 migrations with no error.
- `node scripts/create-fixtures.mjs` prints its summary table (4 rows).
- `rls_tests.sql` prints `ALL RLS TESTS PASSED` (any failure aborts non-zero).
- `gen types` produces a `database.types.ts` with the 8 tables + enums + the
  `get_deck` / `get_my_profile_id` / `delete_my_account` functions.
