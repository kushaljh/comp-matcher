# WP2 — Events + Entries

**Scope:** `app/(tabs)/events/**`, `features/events/**`, `scripts/verify-wp2.mjs`.
Events list, event detail (website/Facebook links + contests), join-a-contest
flow (entries CRUD), and the "suggest an event" form.

## Files

- `features/events/api.ts` — thin supabase-client wrappers: `fetchApprovedEvents`,
  `fetchEvent`, `fetchContestsForEvent`, `fetchMyProfileId` (rpc), `fetchMyEntry`,
  `joinContest`, `updateEntryNote`, `leaveContest`, `suggestEvent`.
- `features/events/hooks.ts` — TanStack Query hooks wrapping the above
  (`useApprovedEvents`, `useEvent`, `useContestsForEvent`, `useMyProfileId`,
  `useMyEntry`, `useJoinContest`, `useUpdateEntryNote`, `useLeaveContest`,
  `useSuggestEvent`).
- `features/events/format.ts` — `formatDateRange`, `isValidDateString`
  (strict YYYY-MM-DD incl. calendar validity), `isPlausibleUrl`.
- `features/events/ContestCard.tsx` — the join/joined/leave UI for one contest
  (division chips, note, races, confirm-to-leave). Extracted from the detail
  screen because it carries real state machinery (join vs. joined vs. editing
  vs. confirming-leave).
- `app/(tabs)/events/_layout.tsx` — bare `<Stack screenOptions={{ headerShown:
  false }} />` so index/[id]/suggest are a stack (back navigation) without any
  native header, matching the rest of the app (root Tabs layout also sets
  `headerShown: false` everywhere — there are no native headers in this app).
- `app/(tabs)/events/index.tsx` — approved events list, replaces the
  "coming soon" placeholder.
- `app/(tabs)/events/[id].tsx` — event detail + contests.
- `app/(tabs)/events/suggest.tsx` — suggest-event form.
- `scripts/verify-wp2.mjs` — live-DB verification (see below).

## Decisions

1. **Events list filters `status = 'approved'` explicitly**, not just relying
   on RLS. RLS's `events_select` policy allows `status = 'approved' OR
   suggested_by = auth.uid()`, which means a suggester would otherwise see
   their own still-pending suggestion in the "approved events" list. The spec
   says pending events "must NOT appear in the public list" — filtering by
   status client-side implements exactly that literal requirement (this is
   implementing the list's own stated filter, not special-casing pending: RLS
   still separately guarantees no one but the suggester can ever see a given
   pending row, regardless of any client filter).

2. **"Suggest event → forced pending" is enforced by omission, not coercion.**
   There is no trigger on `events` that rewrites `status`. The
   `events_insert` RLS policy's `with_check` is `status = 'pending' AND
   suggested_by = auth.uid()`, evaluated against the literal value the client
   sends. So:
   - The app's `suggestEvent()` never includes a `status` field in its insert
     payload at all → the column DEFAULT `'pending'` fills it in before the
     RLS check runs → insert succeeds, row is pending.
   - If a caller explicitly sends `status: 'approved'`, the check evaluates
     against that literal value, sees `'approved' <> 'pending'`, and **rejects
     the insert outright** (RLS violation) — the row never lands in any
     status, approved or otherwise.
   `verify-wp2.mjs` tests both halves: (5a) an explicit `status: 'approved'`
   insert must error, and (5b) the real insert path (no `status` field) must
   land with `status = 'pending'`. Together these mean "an event can only ever
   land pending; a client cannot force it to land approved" — which is the
   substance of the acceptance criterion even though the literal phrase "lands
   with status pending even if the client tries to send approved" doesn't
   describe a coercion mechanism that exists in this schema.

3. **No native headers.** The root `Tabs` layout already sets
   `headerShown: false` globally and none of the existing screens use a native
   header (they build their own screen furniture inside `Screen`). I followed
   suit: `events/_layout.tsx` is a `Stack` with `headerShown: false`, and
   `[id].tsx` / `suggest.tsx` render their own "← Back" text link
   (`router.back()`) instead of a native back button.

4. **Join flow is an inline expand inside each contest's `Card`** (not a modal
   or a separate route). Tapping "Find a partner" reveals a division-chip
   picker restricted to `contest.divisions` plus an optional note field and a
   Join button. Already-joined state ("You're in — {division}") replaces the
   join button, with an editable note (edit → Save/Cancel) and a "Leave
   contest" button that requires a second inline confirm tap before it fires
   the delete (no `Alert.alert` — `react-native-web`'s `Alert.alert` is a
   documented no-op, `node_modules/react-native-web/dist/exports/Alert/index.js`
   is literally `class Alert { static alert() {} }`, so a native-only confirm
   dialog would silently do nothing on web; an inline confirm works
   identically on all three platforms with no extra dependency).

5. **23505 race handling:** `useJoinContest`'s `onSettled` (not just
   `onSuccess`) invalidates the `myEntry` query, so whether the insert
   succeeds or hits a unique-violation race, the UI refetches and renders
   whatever entry actually exists. `ContestCard.handleJoin` special-cases
   `err.code === '23505'` to just collapse the expanded picker instead of
   showing a scary error — the refetch then shows the normal "You're in"
   state.

6. **Division chips on the contest are always shown** (informational, per
   spec: "each with division chips"), separate from the selectable chips that
   appear inside the join picker once expanded.

7. **Date fields are plain YYYY-MM-DD `TextField`s** with a hand-written
   validator (`isValidDateString`) that also rejects invalid calendar dates
   (e.g. `2026-02-30`), plus a start-date-before-end-date check. No datepicker
   dependency, per instructions (deps are frozen).

8. **Dependency on WP1:** per instructions, this feature assumes an
   authenticated user with an existing profile row by the time any
   `events/**` screen is reached (WP1's gate). `useMyProfileId()` /
   `get_my_profile_id()` will return `null` for a signed-in user with no
   profile yet, and `ContestCard` degrades by simply not rendering entry
   controls in that case (`entryLoading || myProfileId == null` short-circuits
   to `null`) — but no dedicated "create a profile first" UI was built here,
   by design.

## Verification

### `npx tsc --noEmit`
Exit code 0, no output (clean).

### `npx expo export --platform web`
Succeeded. Relevant static routes generated:
```
/events (27KB)
/events/[id] (27KB)
/events/suggest (30KB)
/(tabs)/events ... /(tabs)/events/[id] ... /(tabs)/events/suggest
```

### `node scripts/verify-wp2.mjs` (against the live hosted Supabase project)

```
PASS: get_my_profile_id() returns caller profile id
PASS: approved events query returns the 3 seeds with dates
PASS: website/facebook fields present on seeds (Camp Hollywood has both)
PASS: null facebook_url passes through as null (Balboa Rendezvous)
PASS: join contest with a division from contest.divisions succeeds (Amateur Strictly / novice)
PASS: duplicate join is rejected with error code 23505
PASS: division not offered by contest is rejected (Amateur Strictly does not offer advanced)
PASS: insert explicitly requesting status=approved is rejected by RLS
PASS: suggest event lands with status pending
PASS: second throwaway user cannot see the pending event
PASS: the suggester can see their own pending event
PASS: pending event excluded from the approved public list
PASS: cleanup: deleted event b994ca52-20a9-4ca2-aefd-d0c03baee8e3
PASS: cleanup: deleted user c05c3bca-348b-4302-aec8-1c1bacf857e8
PASS: cleanup: deleted user e556a575-22b9-405e-a3a9-6844bd746000
```
Exit code: 0. Post-run spot-check via service role confirmed zero leftover
`%verify%` events and zero `*verify.test` users — cleanup is complete. The 4
`@fixture.test` users and their data were never touched (script only ever
looks up/creates/deletes its own `wp2-*@verify.test` emails).

## Open items

- No dedicated UI for "signed in but no profile yet" on the events screens —
  intentionally deferred to WP1's gate per instructions.
- `isPlausibleUrl` is a light `^https?://` check, not full URL validation —
  good enough to catch obviously-wrong input without pulling in a URL parser.
- `git status` is clean (see below) — everything for this scope is committed.
