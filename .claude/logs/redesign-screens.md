# Redesign screens — The Season, Dance Card, Your Card, auth sweep

Branch: `redesign-screens` (worktree `comp_matcher-wp4`), built on top of the
`redesign-kernel` work (theme system, app shell, Settings). Source of truth
for the visuals: `redesign.dc.html` (sections EVENTS / DANCE CARD / YOUR CARD /
PARTNER DOSSIER, plus the embedded script's data shaping).

## Scope delivered

- **The Season** (`app/(tabs)/events/index.tsx`) — fully rebuilt as an inline
  accordion: header + deco divider, per-event date block / status / toggle,
  expanding panel with per-contest division chips (tap to enter/change),
  live pool counts, "Find a partner" / "Withdraw" (inline confirm). The old
  push-to-detail flow (`app/(tabs)/events/[id].tsx`) and its `ContestCard`
  component are deleted — direct chip-tap entry replaces the separate
  join-with-note screen entirely (see Compromises).
- **`features/events/`**: `hooks.ts` rewritten around `useQueries` (not a
  hook-per-item loop) for `useContestsForEvents` / `useEntriesForContests`,
  keyed exactly as `['contests','byEvent',eventId]` / new `['entries',
  'byContest',contestId]` — the former matches `features/admin/hooks.ts`'s
  existing invalidation key so an admin add/delete-contest still reaches The
  Season. Added `updateEntryDivision`, `fetchEntriesForContest`,
  `formatEventDateBlock`, `formatDateRangeShort`. Removed the now-dead
  `fetchEvent`/`useEvent`, `fetchContestsForEvent`(single)/`useContestsForEvent`
  callers, `useMyEntry`, `updateEntryNote`/`useUpdateEntryNote` — all orphaned
  by the flow change, all confirmed via grep to have no other callers.
- **`features/events/DateRangePicker.tsx`** — converted to `useTheme()`
  (fieldBg wells, mono tracked labels, themed calendar grid). Fixed the
  kernel-logged bug: `calToggleGlyph` (the 📅 button) had no color style at
  all and rendered near-black on the dark surface; it's `colors.brass` now.
  All behavior/validation (typed YYYY-MM-DD, calendar tap, past-date
  rejection, range completion) is unchanged.
- **`app/(tabs)/events/suggest.tsx`** — restyled shell around the same
  `DateRangePicker`/`TextField`/`Button`; validation and submit flow untouched.
- **Dance Card** (`app/(tabs)/matches/index.tsx`, `[id].tsx`) — list restyled
  to the brass-roundel row spec (initial or photo, name, contest·division,
  first contact handle, relative "when", → glyph), grouped by event with the
  fading-rule header. Detail screen rebuilt as the **Partner Dossier**: photo
  header with scrim identity block, "Paired · <when>", Contact-unsealed box
  (likeBg + brass inset ring), values pills, bio, competition record, footer
  bar with "BACK TO THE CARD". `features/matches/api.ts` extended:
  `fetchMatches`/`fetchMatchDetail` now also return `createdAt` (for "Paired ·
  <when>" / relative time) and, for the list, `division` (bulk-looked-up from
  `entries`, since `get_deck()` only ever matches same-contest/same-division —
  see `20260727120300_functions.sql`) and `firstHandle` (bulk-looked-up from
  `profile_contacts`, readable because matched). New
  `features/matches/format.ts` (`formatRelativeTime`) — no dependency, matches
  the hand-rolled-date-math convention already used by
  `features/events/format.ts`.
- **`app/(tabs)/matches/_layout.tsx`** — was drawing a *native* header with
  `theme/tokens`' dark-only colors (contradicting the "no native headers,
  every screen builds its own back link" convention the kernel established
  elsewhere). Fixed to `headerShown: false` to match `events/_layout.tsx` /
  `profile/_layout.tsx`, and because the Partner Dossier now has its own
  "BACK TO THE CARD" pill.
- **Your Card** (`app/(tabs)/profile/index.tsx`) — header + deco divider,
  photo restyled as the single LEAD slot (92px 3:4 tile, 1.5px brass inset,
  "LEAD · PORTRAIT" mono label, "More photo slots coming." per the brief),
  billing name field, locked role well ("ONE PER ACCOUNT"), pitch (bio),
  contacts, entries, values ("What you're after"), competition history — all
  the sub-sections (`EntriesSection`, `ContactsSection`, `HistorySection`,
  `ValuesEditor`) restyled to the theme, same editing behavior. **Sign out and
  Delete account removed from Your Card** — verified first that
  `app/(tabs)/settings/index.tsx` already wires both to the same
  `useSignOut`/`useDeleteAccount` hooks and works (browser-checked: Settings
  shows "Sign out" and "Delete my account" for the signed-in user). Admin
  button row kept, wrapped in a themed section but otherwise untouched.
- **Auth sweep** (`app/(auth)/sign-in.tsx`, `sign-up.tsx`,
  `forgot-password.tsx`, `onboarding/index.tsx`) — converted from the old
  `theme/tokens` color shim (which always resolves to the *dark* palette,
  regardless of the user's actual light/dark setting) to `useTheme()`.
  Concretely this was a real legibility bug, not just a style nit: in light
  mode these four screens would have rendered near-white text
  (`textPrimary` → dark palette's `ink`, `#FBF3E2`) on the light cream
  background. Headlines moved to `fonts.display` (Limelight). No flow/logic
  changes — same validation, same submit handlers, same confirmation-email
  states. `spacing`/`radii` (layout-only, not part of the color bug) are
  still imported from `theme/tokens` where convenient. `app/(auth)/_layout.tsx`
  was already `headerShown: false`; untouched.

## Compromises vs. the design (logged per the brief)

| Design | Here | Why |
| --- | --- | --- |
| Note field on contest join | Dropped entirely | The brief explicitly says chip-tap entry "replaces the old separate join flow"; the redesigned panel has no note textarea anywhere (events list or Your Card entries). The `note` column and existing rows are untouched — just no longer editable from the UI. |
| "Registration closes Aug 1" copy on event cards | Skipped | No `registration_close` field on `events`; noted here per instruction rather than fabricating a date. |
| Date-block vertical brass wash (`linear-gradient(likeBg → transparent)`) | Flat `likeBg` fill | No gradient primitive in RN without a new dependency; `package.json`/deps are frozen and out of scope. |
| PARTNER DOSSIER photo gallery + "Floor footage" video clips | Omitted | Schema has one photo per profile and no video-clip concept at all (not a WP4 scope limitation — there's no `photos`/`clips` table). |
| Your Card "photographs" multi-photo strip | Single LEAD slot only | Same schema reality — `profiles.photo_url` is one column. "More photo slots coming" copy added per the brief's suggestion. |
| City / years-experience line ("Los Angeles · 6 yrs in") on the Partner Dossier | Omitted | No `city` or `years` field on `profiles`; roleLine is role + division only, which the schema actually has. |
| "Find a partner" → deep-links straight into that contest's deck | Routes to `/swipe` (defaults to the user's first entry) | `features/swipe/**` is out of scope to touch and its screen doesn't accept a contest param; if the user has multiple entries this may not open the exact contest/division they just tapped from. |
| Contacts editor slot on Your Card | Kept (restyled), placed after "Your pitch" | Not drawn in the design's YOUR CARD section at all, but functionally required (a match needs contact info to reveal) and pre-existed in the app; dropping it would remove working functionality the design simply didn't depict. |
| Card corner radius on Season event cards | Hardcoded `20` (not `radii.r`=24 or `radii.rSm`=16) | The brief explicitly calls for "radius 20"; theme only defines 24/16/999, and `theme/**` is out of scope to extend. |
| Expanded-card "brass ring + shadow" | 1px brass border + a plain black cross-platform shadow (`shadowColor/shadowOffset/shadowOpacity/shadowRadius` + `elevation`) | No multi-ring glow primitive in RN; same limitation the kernel log already noted for its own screens. |

**Not fixed (found, out of scope):** `features/auth/AuthGate.tsx` renders a
one-line loading `View` with `backgroundColor: colors.tokens.cream` (always
the dark palette's bg) while the session/profile check is in flight — a
one-frame flash that doesn't match light mode. `features/auth/**` is not in
this agent's owned-files list (only the `app/(auth)/` *routes* were in scope),
so left untouched; flagging here rather than silently fixing or silently
ignoring it.

## Verification

```
npx tsc --noEmit                    # 0 errors
npx expo export --platform web      # succeeded, 27 static routes emitted;
                                     # /events/[id] correctly gone from the route list
node scripts/verify-wp2.mjs         # 13/14 assertions PASS (see note below)
node scripts/verify-wp4.mjs         # ALL CHECKS PASSED
```

`verify-wp2.mjs`'s "approved events query returns the 3 seeds" assertion
**fails against the current live DB independent of this branch's changes**:
the DB now has 4 approved events, not 3. Investigated directly (service-role
read, not a fixture/demo/verify account): the 4th is `Breaking Bal`,
`suggested_by` a real user (`kushjjw@gmail.com`, profile "Kush") who suggested
and it was since approved — genuine user content, not test debris, so it was
left alone rather than deleted. This is unrelated to any code in this branch
(the events table, RLS, and seed data were never touched here); the script's
hardcoded "exactly 3" expectation predates this work and `scripts/**` is out
of scope to edit.

### Browser pass

`npx expo export --platform web`, served with `npx serve dist -p 8095 -s`,
signed in as `follower1@fixture.test` (via `get_page_text`/DOM-dispatched
clicks — the browser pane never composited a frame in this environment, so
verification is DOM/network-assertion based rather than eyeballed, same
caveat the kernel log recorded):

- **The Season**: all 3 seeded events (Camp Hollywood, Balboa Rendezvous
  region — actually California Balboa Classic / Stardust Slow Balboa Weekend
  — plus the live `Breaking Bal` row) render with date block, place · range,
  and correct status (`Not entered` vs `Entered · 1 contest`). Expand/collapse
  toggles correctly (`Enter a contest` ⇄ `Hide contests`); California Balboa
  Classic's panel shows all 3 of its contests with correct division chips,
  per-division counts, and poolLine text (`"6 in novice"`,
  `"10 looking across divisions"`, `"nobody in X yet — you're early"` style).
- **Division-chip write path**, exercised live against `follower1`'s real
  fixture entry and fully reverted afterward (confirmed via a direct
  service-role read before/after — the entry row id, division, and note came
  back byte-identical): tapping an unentered contest's division chip issues
  `POST .../entries` (201) and the contest flips to `Entered`, its pool count
  increments, and "Find a partner"/"Withdraw" appear; tapping a *different*
  division chip on an already-entered contest issues an UPDATE (old division's
  count decrements, new one increments, no duplicate row, "Entered · N
  contests" count unchanged); "Withdraw" shows the inline
  "Withdraw from this contest? Confirm/Cancel" row, and Confirm deletes the
  entry and the UI reverts to `Not entered`.
- **Dance Card / Partner Dossier**: `follower1` has no live match, so a
  throwaway matched pair (`screens-a@verify.test` / `screens-b@verify.test`,
  password-protected `.test` accounts, created and fully deleted via the
  service role — zero residue confirmed after) was used to verify the row
  (roundel initial, name, contest · division, first contact handle, relative
  "when", → glyph) and the dossier (photo-header monogram fallback,
  "Paired · N minutes ago", role · division line, Contact-unsealed box with
  Instagram handle, values pill, bio, competition-record row with the year/
  contest/event/placement, footer event+contest line, "Back to the card"
  navigates back). All rendered exactly as expected.
- **Your Card**: header/divider, LEAD photo slot with monogram fallback,
  billing name field, locked role well, pitch, contacts (with edit/delete/add
  platform chips), entries list (event/contest/division pill/Leave), values
  chips (add/remove), competition history (add/edit/delete) all rendered.
  **No Sign out / Delete account visible.**
- **Settings**: confirmed **Sign out** and **Delete my account** both present
  and functional entry points (didn't actually execute delete; did execute
  sign-out via direct `auth.signOut()`-equivalent since `window.confirm`
  doesn't get auto-accepted by the automation).
- **Suggest an event / DateRangePicker**: form renders themed; opening the
  calendar shows properly-colored month title, weekday row, and day cells
  (verified computed styles — brass month nav, ink day numbers, dimmed/line
  color for past/disabled days, bg-on-brass for selected endpoints). The
  📅 toggle glyph is brass, not the previous unstyled black.
- **Light/dark palette check**: flipped Settings → Appearance → Light, then
  reloaded the sign-in screen fresh (cleared the Supabase auth localStorage
  key to force a real unauthenticated render) — headline computed to
  `rgb(32,20,15)` (light `ink`), field labels to `rgb(110,93,76)` (light
  `ink2`), links to `rgb(154,107,18)` (light `brass`). All legible; no
  leftover dark-only hardcoded colors found in the four swept auth screens.

One transient, non-reproducible observation during testing: on the very first
division-chip click of the session (before the panel had been freshly
re-expanded), the pool count and poolLine briefly rendered as `0`/"nobody yet"
for ~2+ seconds and did not self-correct; a follow-up clean pass (fresh page
load → sign in → expand → click, single deliberate action each) reproduced
the correct behavior every time afterward (verified with `fetch` instrumented
to log every Supabase request/response — POST 201 then GET 200 with the full
correct row set). Given it did not reproduce on a clean sequence and the DB
was never left in a bad state (confirmed via direct read — no entry was
actually created on that first attempt), this reads as an artifact of mixing
two different click-dispatch tool paths (`computer` vs `javascript_tool`)
during manual verification rather than a code defect, but is noted here for
visibility rather than silently dismissed.

Not verified interactively: native (iOS/Android) — web export only, same as
the kernel pass.
