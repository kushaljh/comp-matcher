# Stage 2 Adversarial Verification — Comp Matcher

Verifier: Stage 2 adversarial re-verification (disbelieve WP1–WP4 reports, re-establish every claim).
Branch: main @ 71679a9. Base (frozen): f709ec5.
Date: 2026-07-27.

## OVERALL VERDICT: PASS

All 7 gates re-run and passed with pasted evidence. Kernel integrity intact (only the
WP1-excepted app/_layout.tsx changed among frozen paths). Fixtures verified intact and
untouched. No BLOCKER/MAJOR-severity gate failures. One MAJOR robustness finding
(non-atomic onboarding) plus minor/notes below — none block the gates.

---

## GATES

### Gate 1 — RLS tests: PASS
`node scripts/run-sql.mjs supabase/tests/rls_tests.sql`
```
ALL RLS TESTS PASSED
OK: supabase/tests/rls_tests.sql
```

### Gate 2 — Smoke deck + fixture integrity: PASS
`node scripts/smoke-deck.mjs`
```
deck for follower1: [ 'Leo Leader' ]
SMOKE PASSED: deck contains exactly the novice leader.
```
Independent fixture-integrity check (service role, read-only, my scratchpad script):
```
leader1@fixture.test: profile="Leo Leader" role=leader values=["musicality","connection"] entries=1 contacts=2
follower1@fixture.test: profile="Fiona Follower" role=follower values=["musicality","fun"] entries=1 contacts=2
leader2@fixture.test: profile="Advanced Andy" role=leader values=["precision","partnership"] entries=1 contacts=2
follower2@fixture.test: profile="Nova Novice" role=follower values=["fun","community"] entries=1 contacts=2
FIXTURE INTEGRITY OK: all 4 profiles + entries present
```
All 4 fixture users exist with a profile, 1 entry, and 2 contacts each. Untouched.

### Gate 3 — WP1: PASS
`node scripts/verify-wp1.mjs`
```
13 passed, 0 failed.
```
(RLS storage-folder isolation, profile/contacts/history round-trips, cross-folder upload rejection.)

### Gate 4 — WP2: PASS
`node scripts/verify-wp2.mjs` — all 15 PASS lines, incl.:
```
PASS: division not offered by contest is rejected (Amateur Strictly does not offer advanced)
PASS: insert explicitly requesting status=approved is rejected by RLS
PASS: second throwaway user cannot see the pending event
PASS: pending event excluded from the approved public list
```

### Gate 5 — WP3: PASS
`node scripts/verify-wp3.mjs`
```
13/13 checks passed.
VERIFY-WP3 PASSED
```
(Deck division/role filters, mutual-like match creation, get_deck permanence, spoof-swipe RLS rejection.)

### Gate 6 — WP4: PASS (delete-account included, NO KNOWN-FAIL lines)
`node scripts/verify-wp4.mjs`
```
PASS: A can call delete_my_account()
PASS: A's password sign-in fails after account deletion
PASS: the A<->B match row is gone (cascade)
PASS: A's contacts return zero rows (profile cascaded)
ALL CHECKS PASSED
```
Confirmed: migration 20260727150000 (storage protect_delete opt-in) is live — the delete
flow fully passes; no "KNOWN-FAIL (pending migration …)" text present.

### Gate 7 — Build: PASS
`npx tsc --noEmit` → `TSC_EXIT=0` (0 errors).
`npx expo export --platform web` → `EXPORT_EXIT=0`, `Exported: dist`, 25 static routes, web bundle built.
Note: a first run (with a stale dist/) emitted a transient metro `FileMap.read` stack trace but
still exited 0; a clean re-run after `rm -rf dist` exported with zero error/warn lines. Benign.

---

## KERNEL INTEGRITY: PASS
`git diff --stat f709ec5..HEAD` over frozen paths (package.json, pnpm-lock.yaml, app.json,
tsconfig.json, babel.config.js, lib/**, theme/**, app/(tabs)/_layout.tsx, app/index.tsx, supabase/**):
```
 app/_layout.tsx | 13 ++++++++++---
 1 file changed, 10 insertions(+), 3 deletions(-)
```
Only app/_layout.tsx changed — the sanctioned WP1 exception. No lib/**, theme/**, supabase/**,
build-config, or frozen-route file was modified. scripts/verify-*.mjs and .claude/logs/*.md
changed too, but neither is a frozen path. CLEAN.

---

## CLAIM AUDITS

### WP1 — AuthGate + onboarding
- Redirect coverage (features/auth/AuthGate.tsx:45-63): no session → sign-in (incl. bounced OUT
  of onboarding, because inSignInFlow excludes onboarding, line 42); session w/o profile →
  onboarding; session+profile in (auth) → tabs. No redirect loops (each branch returns; the
  session+profile+non-auth case falls through without redirecting). VERIFIED sound.
- Onboarding submit order (features/auth/api.ts:67-101): photo upload → profile insert → contacts
  → history, in that order, with NO transaction. See MAJOR finding F1 for partial-failure wedge.

### WP3 — shared handler + match detection
- Single commit path VERIFIED: both the ✓/✗ buttons (Deck.tsx:89-93 handleButton →
  topCardRef.swipe → SwipeCard triggerSwipe, SwipeCard.tsx:45-55 imperative handle) and a gesture
  flick (SwipeCard.tsx:66-74 onEnd → runOnJS(triggerSwipe)) resolve through the SAME onSwiped →
  Deck.handleSwipe (Deck.tsx:60), which is the only place a swipe is persisted.
- Match detection VERIFIED as a DB query, not client inference: after a like, findMatch
  (features/swipe/data.ts:138-154) SELECTs the matches table by the canonical (profile_a<profile_b)
  pair. The row is created server-side by the SECURITY DEFINER trigger (match_trigger.sql).

### WP4 — contact reveal + delete flow
- Contact reveal is RLS-only VERIFIED: fetchOtherContacts (matches/api.ts:191-199) is an unfiltered
  SELECT on profile_contacts by profile_id; there is NO client-side match check. Security comes
  solely from policy profile_contacts_select (rls.sql:78-93: owner OR mutual match in ANY contest).
  verify-wp4 confirms an unmatched user reads ZERO of the target's contacts.
- Delete flow VERIFIED: deleteMyAccount (profile/api.ts:176-180) calls rpc('delete_my_account')
  then signOut(); AuthGate then redirects to sign-in on the cleared session.

### WP2 — pending-event invisibility
- RLS-backed VERIFIED: events_select (rls.sql:181-186) shows approved OR own-suggested only;
  contests_select (rls.sql:199-207) gates on parent-event visibility. Client list
  fetchApprovedEvents (events/api.ts:17-27) additionally filters status='approved'. fetchEvent by
  id (events/api.ts:29-33) is RLS-gated → a stranger's pending event returns null ("Event not
  found"). No path renders another user's pending event.

---

## FINDINGS (adversarial hunt)

### F1 — MAJOR — Onboarding submit is non-atomic; mid-way failure wedges the user
`features/auth/api.ts:67-101`, `app/(auth)/onboarding/index.tsx:105-146`.
submitOnboarding inserts the profile row, THEN contacts, THEN history, with no transaction. If the
profile insert succeeds but the contacts (or history) insert fails (e.g. a transient network drop),
the profiles row persists. The screen catches the error and stays on onboarding WITHOUT calling
setQueryData(hasProfile=true). Retrying "Finish" re-runs submitOnboarding, whose profile insert now
violates UNIQUE(user_id) (schema.sql:32) → raises 23505 → the user can never complete onboarding on
that session (the retry always dies on the duplicate profile). Only a full app reload (which
refetches useHasProfile → now true) lets them past the gate — landing them in the app with a profile
that has zero contacts and no clear signal, even though contacts are the app's core value.
Recoverable via the Profile tab, but the onboarding flow itself is genuinely wedged. Note the
contrast: ContestCard.tsx:44 explicitly special-cases 23505; onboarding does not.

### F2 — MINOR — Swipe deck mishandles a 23505 duplicate swipe
`features/swipe/Deck.tsx:80-84`.
handleSwipe's catch is blanket: a UNIQUE(contest_id, swiper, target) violation (schema.sql:130) is
reported as "Could not save your swipe. Check your connection and try again." and the card is
re-added to the top of the stack — so a genuinely-already-swiped card can loop (re-swipe → 23505 →
re-add). Largely shielded because get_deck excludes already-swiped candidates, so this is only
reachable from a stale deck across two sessions/devices. Inconsistent with ContestCard's explicit
23505 handling.

### F3 — MINOR/NOTE — Deck/entries access is not gated on event approval status
`supabase/migrations/20260727120300_functions.sql:36-93`, `20260727120100_rls.sql:213-215`.
get_deck (SECURITY INVOKER) filters only by contest/division/role/swipes/matches, and entries_select
is `using(true)`. Neither checks events.status. If a user holds a contest_id whose parent event is
pending or was reverted to pending (e.g. an admin un-approves after entries exist), they can still
call get_deck and swipe/match there. Not a data leak (the candidate pool is public by design), and
hard to reach through the UI because contests_select hides such contests from useMyEntries/the
picker — but a cached selectedContestId still works. Consistency gap, not a security hole.

### F4 — NOTE — Values tags: fixed list in onboarding vs free-text in profile editor
`features/auth/constants.ts:10-17` (VALUES = winning/social fun/yolo/exposure/improving/making
friends) vs `features/profile/components/ValuesEditor.tsx` (arbitrary free-text add/remove). Both
write the same free-text `values` text[] column, and all renderers (CardContent, match detail,
ValuesEditor) map arbitrary strings to chips, so there is NO drift/crash — fixtures/seeds even use
off-list values ("musicality", etc.) that render fine. Purely a UX inconsistency.

### F5 — NOTE — No error UI on account-action failures
`features/profile/hooks.ts:179-185` and the profile handlers: useSignOut/useDeleteAccount have no
onError; if delete_my_account or signOut rejects, nothing is surfaced to the user.

### F6 — NOTE — profile-photos bucket is public
`supabase/migrations/20260727120150_storage.sql:23-25`. World-readable by URL. Already logged by the
team as a pre-public-launch item; not a regression.

### Cleared (checked, not issues)
- Candidate with no photo_url: CardContent.tsx:32-43 falls back to an initial placeholder. Fixtures
  have null photo_url and the deck renders fine.
- Same pair matched in multiple contests: matches UNIQUE is (contest_id, profile_a, profile_b)
  (schema.sql:146), so each contest is a distinct row; matches list groups by event and keys by
  match id — renders separate cards correctly.
- Route tree: (tabs) declares events/swipe/matches/profile; nested Stacks in events & matches; no
  route collisions or dead routes. Group-prefixed duplicates in the export (/sign-in vs
  /(auth)/sign-in) are normal expo-router output.
- Onboarding web photo path: uploadProfilePhoto fetches the blob and uploads with contentType
  (api.ts:50-65) — the documented web/native path; verify-wp1 exercises upload against live storage.
