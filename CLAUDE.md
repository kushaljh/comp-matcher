# Comp Matcher

Invite-only partner registry for the swing & balboa competition circuit. Expo Router (iOS /
Android / web from one codebase) on Supabase (Postgres + RLS + Auth + Storage).

---

## Rule #1 — a change lands on EVERY surface, not the one you were looking at

Most things in this app are entered, displayed, or moderated in **more than one place**. A change
applied to one of them and not its twin is the most common defect here, and it is invisible in
review: both files compile, both screens render, and the two just disagree.

**Before calling any change done, search for every other place the same thing appears** and make
the same change there. `grep` for the label text, the component, the column name, the enum value —
not just the file you edited.

### Known twin surfaces

| If you change… | You must also change… |
|---|---|
| A **contact field** (validation, keyboard, formatting, error timing) | Both entry points: `app/(auth)/onboarding/index.tsx` **and** `features/profile/components/ContactsSection.tsx`. Shared behaviour belongs in `features/profile/contactField.ts`, rules in `contactValidation.ts` |
| A **contact platform label** | Four definitions exist: `features/auth/constants.ts` (exported), plus local copies in `features/matches/components.tsx`, `features/profile/components/ContactsSection.tsx`, `features/admin/DancerRoster.tsx` |
| A **tab / nav destination** | `NAV` in `app/(tabs)/_layout.tsx` drives the wide left rail *and* the narrow tab bar; the route directory must exist under `app/(tabs)/` |
| An **admin sub-page** | The page file, a `<Stack.Screen>` in `app/(tabs)/admin/_layout.tsx`, and a `MenuRow` in `app/(tabs)/admin/index.tsx` |
| A new **`admin_actions` action** written by an RPC | `ACTION_LABELS` in `app/(tabs)/admin/log.tsx`, or the log shows the raw slug |
| A new **table, column, RPC or enum** | `lib/database.types.ts` **by hand** (see below), plus `Constants.public.Enums` for enums |
| A key in **`admin_overview()`** | The `AdminOverview` type in `features/admin/api.ts` and the tiles/rows in `app/(tabs)/admin/index.tsx` |
| A **profile field** | Wherever a card is rendered: swipe deck, match detail, admin roster |

Two entries above (contacts, admin log) are drift this project has actually shipped. Assume there
are more.

### Finish-line checklist

1. `grep` the label/column/component name — did every hit get the change?
2. Does the same thing get **entered** anywhere else (onboarding vs. profile editing)?
3. Does the same thing get **displayed** anywhere else (own card vs. deck vs. match vs. admin)?
4. Does an **admin** see it too, and does the admin log name it in English?
5. `npx tsc --noEmit` clean.

---

## Project structure

```
app/                     Expo Router routes — the file tree IS the URL structure
  _layout.tsx            Root: maintenance gate, providers, AuthGate
  (auth)/                Signed-out + not-yet-onboarded: sign-in/up, invite, onboarding
  (tabs)/                The signed-in shell
    _layout.tsx          NAV array -> left rail (>=1080px) + bottom tab bar
    swipe/ events/ matches/ profile/ settings/ feedback/
    admin/               Admin-only: index (landing), events, dancers, invites, feedback, log

features/<name>/         One directory per feature. api.ts (supabase calls, no React)
                         + hooks.ts (TanStack Query) + components. See features/README.md —
                         do not edit another feature's directory.

lib/
  supabase.ts            The single client
  queryClient.ts         Query defaults (staleTime 60s, retry 2, no refetch-on-focus)
  database.types.ts      HAND-MAINTAINED schema types — no Docker here, so no codegen

theme/
  ThemeProvider.tsx      useTheme() -> colors, fonts, fs(), radii, mode, textScale, reduceMotion
  components.tsx         Screen, Button, TextField, Card — all themed
  palette.ts fonts.ts
  tokens.ts              LEGACY static shim. Still used by features/admin/* and app/(tabs)/admin/*

supabase/
  migrations/            YYYYMMDDHHMMSS_topic.sql, applied in order
  tests/rls_tests.sql    One transaction, rolls back, raises on any failed assertion

scripts/                 run-sql.mjs (psql substitute), verify-*.mjs (live end-to-end checks),
                         grant-admin.mjs, create-demo-profiles.mjs, create-fixtures.mjs
api/                     scrape-contests.mjs (serverless)
```

---

## Conventions worth knowing before editing

**Two theme eras.** User-facing screens use `useTheme()` (`theme/ThemeProvider`). Everything under
`features/admin/` and `app/(tabs)/admin/` still uses the legacy static `theme/tokens`. Match the
neighbours of the file you are in; don't migrate one file in isolation.

**Database types are typed by hand.** `lib/database.types.ts` is transcribed in the exact shape
`supabase gen types` emits, because codegen needs Docker and there is none on this machine. Every
new table/RPC/enum needs a manual edit there, `Constants.public.Enums` included.

**Security lives in the database, not the screen.** RLS is the gate; `AdminGate` is only UX. The
canonical admin check is a bare `exists (select 1 from public.admin_users a where a.user_id =
(select auth.uid()))` — deliberately no helper function. Anything an admin *does* goes through a
`security definer` RPC rather than an RLS UPDATE policy, because **RLS cannot restrict which
columns a policy covers**. Every migration opens with a comment explaining the reasoning, not just
the change.

**Web is a first-class target.** Use `confirmAsync` (`features/profile/confirm.ts`), never
`Alert.alert`. Use `Pressable` + `router.push`, not `<Link>` wrapping multiple `<Text>`s — on
react-native-web a `Link` is an `<a>` and its children lay out inline.

**Store canonical values, display friendly ones.** Contacts are canonicalised before insert (phone
-> E.164, handles stripped of `@` and unwrapped from pasted URLs). Display formatting is cosmetic
and must survive a round trip through the validator.

## Commands

```bash
node scripts/run-sql.mjs supabase/migrations/<file>.sql   # apply a migration
node scripts/run-sql.mjs supabase/tests/rls_tests.sql     # RLS regression suite
node scripts/verify-<feature>.mjs                         # live end-to-end check
npx tsc --noEmit                                          # typecheck
```

Requires `.env` at the repo root (`SUPABASE_DB_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Run the dev server through the
harness's preview tooling (`.claude/launch.json`), not `npm run web`.
