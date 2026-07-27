# WP1 — Auth + Onboarding

## Scope

Everything under `app/(auth)/**` and `features/auth/**`: sign-in, sign-up,
forgot-password, session plumbing (SessionProvider + AuthGate), and the
onboarding wizard (photo, display name, role, values, bio, contacts,
competition history). Plus a minimal, additive wire-up of `app/_layout.tsx`
(the one explicitly granted exception) and `scripts/verify-wp1.mjs`.

## Files created / changed

Created:
- `features/auth/constants.ts` — `VALUES` tag list (winning · social fun ·
  yolo · exposure · improving · making friends); `CONTACT_PLATFORMS` /
  `DANCE_ROLES` re-exported from `lib/database.types.ts`'s `Constants` (single
  source of truth — no duplicated enum lists); `PLATFORM_LABELS` display
  strings.
- `features/auth/SessionProvider.tsx` — subscribes to
  `supabase.auth.onAuthStateChange` + an initial `getSession()`, exposes
  `{ session, initializing }` via context.
- `features/auth/useHasProfile.ts` — TanStack Query hook: does the signed-in
  user have a `profiles` row. Exports `hasProfileQueryKey(userId)` so the
  onboarding screen can update the cache directly on submit.
- `features/auth/AuthGate.tsx` — the redirect brain (see trace below).
- `features/auth/api.ts` — `signUpWithEmail`, `signInWithEmail`,
  `requestPasswordReset`, `signOut`, and `submitOnboarding` (upload photo ->
  insert profile -> insert contacts -> insert history — the same sequence
  `scripts/verify-wp1.mjs` exercises against the live DB).
- `app/(auth)/_layout.tsx` — plain `Stack`, four screens.
- `app/(auth)/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`.
- `app/(auth)/onboarding/index.tsx` — the wizard (single scrollable form).
- `scripts/verify-wp1.mjs` — live-DB verification (acceptance criterion 2).
- `.claude/logs/wp1-auth.md` — this file.

Changed (the one granted exception):
- `app/_layout.tsx` — wrapped the existing `<Stack>` in `<SessionProvider>` +
  `<AuthGate>`, and added a `<Stack.Screen name="(auth)" />` entry alongside
  the existing `(tabs)` one. No other line touched.

## Decisions

**Wizard structure — single scrollable form, not a stepper.** Nothing in the
onboarding data has a hard ordering dependency (photo/name/role/values/bio/
contacts/history are all independent fields going into 3 separate inserts),
so a multi-step wizard would only add navigation state for no benefit.
Submission is blocked (`canSubmit` in `onboarding/index.tsx`) until photo +
display_name + role + >=1 contact are present; a live "Still need: ..." hint
lists exactly what's missing.

**Values list** (free-text `string[]`, not a DB enum, so defined once in
`features/auth/constants.ts`): `winning`, `social fun`, `yolo`, `exposure`,
`improving`, `making friends` — verbatim from the spec.

**Contact platforms and role list are NOT redefined** — pulled from
`lib/database.types.ts`'s exported `Constants.public.Enums.contact_platform`
/ `dance_role`, so if the enum ever changes there is exactly one place to
update.

**Contact/history row filtering at submit time.** The wizard lets a user add
an empty contact or history row (e.g. via "+ Add another contact") and leave
it blank; at submit time, contact rows with an empty handle and history rows
missing event_name/contest_name/a parseable year are silently dropped rather
than rejected, so a stray empty row someone forgot to remove doesn't block
submission or produce a garbage insert. The `canSubmit` gate itself still
requires >=1 *filled* contact.

**Photo upload: `fetch(uri)` -> Blob -> `contentType`**, per the spec's
explicit instruction, used uniformly for web and native (the picked asset's
`uri` is fetchable on both platforms in this Expo/RN version). Path:
`${user.id}/avatar-${Date.now()}.jpg`, matching the storage policy's
`<uid>/%` prefix check in `20260727120150_storage.sql`.

**Email-confirmation UX.** `signUpWithEmail` returns `data.session`. If it's
`null` (confirm-email ON, the hosted default), the sign-up screen switches to
a static "check your email, then come back and sign in" panel and does NOT
navigate. If a session comes back immediately (confirm-email OFF), no manual
navigation call is made from the screen — `SessionProvider`'s
`onAuthStateChange` listener picks up the new session and `AuthGate` reacts
by routing to onboarding on its own. Same pattern for sign-in: the screen
never calls `router.replace` itself; all post-auth navigation is centralized
in `AuthGate` so there is exactly one place that decides where a session
should land.

**Forgot-password is intentionally minimal (MVP).**
`resetPasswordForEmail` is called and a static confirmation message shown.
Completing the reset via the emailed link is NOT wired up in-app (no deep
link handler registered for the recovery flow) — the on-screen copy says so
explicitly. **Open item for a future stage.**

**AuthGate implementation: manual `useSegments`/`useEffect`/`router.replace`,
not `Stack.Protected`.** This expo-router version (57.0.8) does ship a
`Stack.Protected` guard API (confirmed by inspecting
`node_modules/expo-router/build/views/Protected.d.ts`), which is the more
"official" declarative mechanism. I chose the manual approach instead because
it gives one single component full control over the loading-splash gate and
because reasoning about its correctness (and fixing the bug described below)
was more tractable than coordinating two separate `Stack.Protected` guard
layers (root tabs-vs-auth, and nested sign-in-vs-onboarding within the
`(auth)` layout) whose interaction with the frozen, always-redirects
`app/index.tsx` I could not modify to test around. This is a deliberate
simplicity/certainty tradeoff, not an oversight — flagged here in case a
later stage wants to migrate to `Stack.Protected`.

## A real bug found and fixed during manual QA

Initial `AuthGate` logic treated the entire `(auth)` route group as an
acceptable "no session" destination:

```ts
if (!session) {
  if (!inAuthGroup) router.replace('/(auth)/sign-in');
  return;
}
```

This is wrong for `/onboarding`, which is *inside* `(auth)` but *requires* a
session (it reads `session.user.id`). Manually testing sign-out while sitting
on the onboarding screen (see trace below) showed the app just staying on
onboarding after sign-out — no redirect — because `inAuthGroup` was `true`
there too, so the guard never fired. Fixed by introducing `inSignInFlow =
inAuthGroup && !inOnboarding` and gating the no-session redirect on that
instead of on `inAuthGroup`. Re-tested after the fix: sign-out from
`/onboarding` now correctly lands on `/sign-in` (see verification below).

Also added `segments` itself to the redirect effect's dependency array
(alongside the derived `inAuthGroup`/`inOnboarding`/`inSignInFlow` booleans):
those booleans can be unchanged (`false -> false`) across a segments change
that still matters for the effect to re-run in principle; including
`segments` directly closes that gap even though it wasn't the cause of the
bug above.

## Sign-out trace (AuthGate reacting to session -> null)

1. Something calls `supabase.auth.signOut()` (exported as `signOut()` from
   `features/auth/api.ts` for whoever wires up a sign-out control — WP1 does
   not own `app/(tabs)/profile`, so no button lives there; the primitive is
   exported for that screen's owner to use).
2. `signOut()` clears the persisted session (localStorage on web /
   AsyncStorage on native, per the frozen `lib/supabase.ts`) and fires a
   `SIGNED_OUT` event through `supabase.auth.onAuthStateChange`.
3. `SessionProvider`'s listener (`features/auth/SessionProvider.tsx`) is
   subscribed to that event; it calls `setSession(null)`, which propagates
   through context to every consumer of `useSession()`.
4. `AuthGate` re-renders with `session === null`. `loading` is `false`
   (initializing already settled long ago). The redirect effect runs: `!session`
   is true; `inSignInFlow` is false wherever the user was sitting (tabs,
   onboarding, or anywhere else outside sign-in/sign-up/forgot-password) ->
   `router.replace('/(auth)/sign-in')` fires.
5. `useHasProfile()` also flips to `enabled: false` (no `userId`), so its
   cached data is irrelevant going forward.

**Empirically verified** (not just reasoned through): created a throwaway
confirmed user via the admin API, signed in through the real sign-in screen
in a live `expo start --web` session, landed on `/onboarding` (no profile
yet), then invoked `supabase.auth.signOut()` from that page (temporarily
exposed on `window` for the console, reverted before committing — see git
history / this log, not present in the committed code) and confirmed:
`localStorage`'s `sb-...-auth-token` entry was cleared, and the app
navigated to `/sign-in` within ~1s. This is the same test that surfaced the
`inAuthGroup`-vs-`inSignInFlow` bug above (before the fix, sign-out from
onboarding did NOT redirect); after the fix, verified again from a fresh
sign-in and it correctly redirected.

## Verification

### 1. `npx tsc --noEmit` and `npx expo export --platform web`

```
$ npx tsc --noEmit
(no output — zero errors)

$ npx expo export --platform web
...
Static rendering is enabled. Learn more: https://docs.expo.dev/router/web/static-rendering/
λ Bundled 8483ms ...render.js (1377 modules)
Web Bundled 9747ms ...entry.js (1361 modules)

› web bundles (1):
_expo/static/js/web/entry-36cca9013a39db7afab71d28d259a8a1.js (2.6MB)

› Static routes (19):
/ (index) (18KB)
/sign-in (18KB)
/sign-up (18KB)
/_sitemap (17KB)
/+not-found (17KB)
/swipe (18KB)
/events (18KB)
/matches (18KB)
/profile (18KB)
/(auth)/sign-in (18KB)
/(auth)/sign-up (18KB)
/forgot-password (18KB)
/onboarding (18KB)
/(tabs)/swipe (18KB)
/(tabs)/events (18KB)
/(tabs)/matches (18KB)
/(tabs)/profile (18KB)
/(auth)/forgot-password (18KB)
/(auth)/onboarding (18KB)

Exported: dist
```

(`dist/` was deleted afterwards — it's gitignored and not needed beyond
proving the export succeeds.)

### 2. `node scripts/verify-wp1.mjs` (against the live hosted DB)

```
setup: created throwaway user A (wp1-verify-a-1785131527860@verify.test)
setup: created throwaway user B (wp1-verify-b-1785131527860@verify.test)
PASS: sign in as user A with the anon client (ok)
PASS: upload tiny PNG into own storage folder (ok)
PASS: get public URL for uploaded avatar
PASS: insert profile row (ok)
PASS: insert 2 contacts (ok)
PASS: insert 1 competition history row (ok)
PASS: read back own profile row (ok)
PASS: profile.display_name round-trips
PASS: profile.role round-trips
PASS: profile.photo_url round-trips
PASS: read back >=2 contacts (got 2)
PASS: read back >=1 competition history row (got 1)
PASS: upload into a DIFFERENT user's storage folder is rejected by policy
cleanup: removed storage object 74e9eea0-311f-408a-be16-7fc872ada93a/avatar-verify.png
cleanup: deleted throwaway user A
cleanup: deleted throwaway user B

13 passed, 0 failed.
```

No fixture users or fixture data were read, written, or touched by this
script — it only ever operates on the two `@verify.test` users it creates
and deletes within the same run.

### 3. Manual browser QA (`expo start --web`, real UI, no mocks)

- Fresh load with no session -> redirected to `/sign-in` (confirmed after
  hydration; see web SSR caveat below).
- Signed in via the real sign-in form (a throwaway admin-created, confirmed,
  profile-less user) -> `AuthGate` correctly routed to `/onboarding` (session
  present, no `profiles` row).
- Filled display name, selected a role chip, filled one contact handle on the
  onboarding form -> the "Still need: ..." hint correctly shrank from all
  four requirements down to just "a profile photo" (the one requirement not
  drivable through browser automation, since `expo-image-picker` on web opens
  a native OS file-picker dialog outside the DOM). This confirms the wizard's
  client-side validation/gating wiring is correct; the actual submit path
  (upload + 3 inserts against RLS) is what `scripts/verify-wp1.mjs` proves
  end-to-end instead.
- Sign-out from `/onboarding` -> redirected to `/sign-in` (this is also where
  the bug above was found and re-verified after the fix).

**Known, out-of-scope characteristic (web only): a brief static-HTML flash
before hydration.** `app.json`'s `web.output: "static"` (frozen, not
something WP1 can change) means `expo export`/`expo start --web` pre-renders
an HTML shell per route on the server, with no knowledge of the client's
(localStorage-only) session. The very first paint on web can therefore show
default content for whatever route was requested before React hydrates and
`AuthGate` takes over — typically well under a second in practice. This is
inherent to combining static/SSR web rendering with a client-only session
store (the same tradeoff any SPA with client-side-only auth has); fixing it
would need cookie-based, server-visible sessions, which is out of scope for
WP1 and would require changes to the frozen `lib/supabase.ts`. **Not an issue
on native** (iOS/Android): there is no pre-render step there, so `AuthGate`'s
blank-cream-screen loading gate fully prevents any flicker.

## Open items

- **Password-reset deep link.** `forgot-password.tsx` only calls
  `resetPasswordForEmail` and shows a static confirmation; finishing the
  reset (handling the recovery-token deep link, showing a "set new password"
  screen) is not implemented. Noted on-screen and here per the spec's MVP
  allowance.
- **Web SSR pre-hydration flash**, described above — architectural, not a
  WP1 defect, not fixable within WP1's writable/frozen file boundaries.

## Deviations from a literal reading of the spec

- `competition_history` rows require `event_name`, `contest_name`, and a
  parseable `year` to be inserted; a row missing any of those is silently
  dropped at submit rather than blocking the whole submission. This matches
  the DB schema (`event_name`/`contest_name`/`year` are `NOT NULL`) and
  avoids inserting garbage rows from an accidentally-left-blank "+ Add a
  competition" row, while still keeping history fully optional overall (zero
  rows is fine).

## `git status` — clean

```
$ git status
On branch wp1-auth
nothing to commit, working tree clean
```

(captured after the commit below)
