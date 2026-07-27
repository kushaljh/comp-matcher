# Stage 0 join — orchestrator log

**Scope:** commit 0a/0b, apply the database layer to the hosted Supabase project, verify it live, produce `lib/database.types.ts`, prepare Stage 1 worktrees.

## What happened

1. Committed 0a (`62512b0`) and 0b (`0762f64`).
2. `supabase db push --db-url … --include-seed` → all 6 migrations + seed applied cleanly to the hosted project (Docker warnings are local-cache only, harmless).
3. `node scripts/create-fixtures.mjs` → 4 fixture users created (leader1/follower1 novice in CalBal "Strictly Balboa"; leader2 advanced same contest; follower2 novice in Strictly Lindy). Password: `Fixture123!`.
4. RLS test suite run live: **ALL RLS TESTS PASSED** (6 assertions: swipe privacy, contact gating, pending-event visibility, swiper spoofing, direct match insert, get_deck filtering).
5. Live client-path smoke test (`scripts/smoke-deck.mjs`): signed in as follower1 with the anon key, called `get_deck` → exactly one row ("Leo Leader", novice). Confirms PostgREST GRANTs + RLS + deck filtering through the same path the app uses.
6. `npx tsc --noEmit` clean against the real types.

## Deviations / decisions

- **`pg` added as devDependency** + `scripts/run-sql.mjs` (psql is not installed on this machine; the runner strips psql meta-commands like `\echo`). Added BEFORE worktrees were cut, so all worktrees share one lockfile.
- **`lib/database.types.ts` is hand-transcribed**, not generated: `supabase gen types --db-url` shells out to a postgres-meta container and there is no Docker/podman here. Transcribed 1:1 from the migrations in the exact `supabase gen` shape. Schema is frozen for MVP; regenerate canonically on a Docker machine if it ever changes (command in the file header).
- **`scripts/smoke-deck.mjs` added** as a permanent re-runnable gate for the Stage 2 verifier.
- **Security note:** the failed `gen types` attempt printed the DB connection string (incl. password) into the session transcript. Recommended: rotate the database password in the dashboard after the build settles. `.env` itself is gitignored and was never committed.

## Open items

- Supabase Auth "Confirm email" is ON by default for hosted projects; WP1 must handle the session-less signup case ("check your email" state). Optionally disable it in Dashboard → Auth for smoother testing (user decision).
- Storage bucket is public-read (documented MVP tradeoff in 0b log) — revisit before public launch.
