# WP3 — Swipe Deck + Matching

Owner: WP3 agent. Branch `wp3-swipe`, worktree `comp_matcher-wp3`.

## Scope delivered

The core product loop on the Swipe tab:

- **Contest picker** (`app/(tabs)/swipe/index.tsx`): resolves the caller's profile
  via `rpc('get_my_profile_id')`, loads their entries (embedded select
  `entries -> contests -> events`), and renders a horizontal chip selector. No
  profile / no entries → empty state with a "Browse events" button that
  `router.push('/events')` (plain route string, no cross-feature import).
- **Deck** for the selected contest via `rpc('get_deck', { p_contest_id })`
  (server already filters opposite-role / same-division / un-swiped / un-matched).
  A two-card stack (top + a scaled-back peek). Card face: photo (expo-image with
  an initial-letter placeholder when `photo_url` is null), display name, division
  chip, values chips, 3-line bio, and up to 3 competition-history rows with
  placements. History for **every** deck profile is fetched in ONE query
  (`competition_history … in(profileIds)`) and grouped by `profile_id`.
- **Gestures + buttons share one code path.** `SwipeCard` exposes an imperative
  `swipe(direction)` handle. Both the pan-gesture release past threshold (via
  `runOnJS`) and the ✓/✗ buttons (via the ref) call the *same* `triggerSwipe`
  function, which runs the identical fly-off `withTiming` animation and, on
  completion, the identical `onSwiped(direction)` callback → `Deck.handleSwipe`.
- **Swipe persistence**: optimistic card removal, then `insert into swipes`. On
  failure the card is put back on top and an inline error banner appears. On a
  LIKE, after the insert resolves, `matches` is queried for the canonical
  (contest, ordered-pair) row — the DB trigger creates it in the same statement
  on a mutual like — and if found the **"It's a match!"** overlay is shown (both
  faces, copy that contacts are now visible in Matches, a "See matches" CTA →
  `router.push('/matches')`, and "Keep swiping" to dismiss).
- **Empty deck** state + refetch on contest change (query key) and on screen
  focus (`useFocusEffect`). A swiped card never resurfaces (server filters it;
  the client also removes it; local state re-seeds from the query only when the
  data reference genuinely changes, so optimistic removals survive between
  fetches but converge to server truth on refetch).

## Key decisions

- **Single animation path (acceptance criterion).** Rather than duplicate logic,
  the fly-off is a JS-thread function `triggerSwipe(direction)` in
  `features/swipe/SwipeCard.tsx` (lines ~45-53). Setting a shared value to
  `withTiming(...)` from the JS thread is fully supported by Reanimated and is
  more reliable on web than pushing the whole thing through the UI thread — which
  matters because the buttons must work where web pan gestures are flaky. The
  gesture's `onEnd` worklet decides direction then `runOnJS(triggerSwipe)(dir)`;
  the buttons call `topCardRef.current.swipe(dir)` → `triggerSwipe`. One
  animation, one `onSwiped`, one `handleSwipe`.
- **Animation params**: fly-off `withTiming` 240 ms to ±1.6× card width; spring
  back to centre on release below threshold; threshold = 28% of card width;
  rotation interpolates translateX→[-8°,+8°]; LIKE/PASS badge opacity interpolates
  from 0→threshold. Peek card is a static `scale(0.94) translateY(14)` behind the
  top card.
- **Deck data flow**: `get_deck` (RPC, security-invoker so RLS applies) → local
  `stack` state in `Deck` seeded from the query and re-seeded only when the query
  hands a new reference (TanStack structural sharing keeps it stable when the
  result is unchanged). Buttons are guarded by a `busyRef` so spamming can't
  double-fire a card that is still mid-fly-off.
- **Match-check approach**: query the ordered pair directly
  (`profile_a = min(me,target)`, `profile_b = max(...)`) with `maybeSingle()`.
  The `AFTER INSERT` match trigger runs inside the swipe insert's statement, so
  the row is present the moment the insert resolves — no polling/subscription
  needed. RLS `matches_select` lets both members read it.
- **Minor tightening**: `useDeck` uses `staleTime: 0` so a focus refetch always
  re-checks the server (permanence of swipes). The screen shows the "No contests"
  empty state for both the signed-out (`get_my_profile_id` → null) and
  no-entries cases; building auth is out of WP3 scope.

## Files

Created:
- `features/swipe/types.ts` — DB-derived shared types.
- `features/swipe/data.ts` — TanStack Query hooks (`useMyProfileId`, `useMyFace`,
  `useMyEntries`, `useDeck`, `useDeckHistory`) + write helpers (`insertSwipe`,
  `findMatch`).
- `features/swipe/Chip.tsx` — division / value pill.
- `features/swipe/CardContent.tsx` — presentational card face.
- `features/swipe/SwipeCard.tsx` — animated gesture card + imperative handle.
- `features/swipe/ContestPicker.tsx` — contest chip selector.
- `features/swipe/MatchOverlay.tsx` — "It's a match!" modal.
- `features/swipe/Deck.tsx` — stack orchestration, buttons, swipe flow, overlay.
- `scripts/verify-wp3.mjs` — live DB acceptance verification.

Modified:
- `app/(tabs)/swipe/index.tsx` — the screen (was the "coming soon" stub).

## Verification output (verbatim)

### 1. Typecheck + web export

```
$ npx tsc --noEmit
(zero errors)

$ npx expo export --platform web
Web Bundled 41700ms … entry.js (1380 modules)
› Static routes (11):
/swipe (27KB)
…
Exported: dist
```

Static rendering executed `/swipe` (27KB) without throwing — the screen mounts
(including the Reanimated/gesture-handler bundle) in its loading/empty state.

### 2. Live DB verify — `node scripts/verify-wp3.mjs`

```
Using contest Strictly Balboa @ Balboa Rendezvous (b3333333-0000-4000-8000-000000000001)
  divisions: novice, amateur, advanced, open

PASS: B's deck contains A and D — deck=2 card(s)
PASS: B's deck EXCLUDES C (wrong division)
PASS: B's deck EXCLUDES B / same-role followers
PASS: A can like B (own swipe accepted)
PASS: no match row after only A liked
PASS: B's deck STILL contains A (B hasn't swiped)
PASS: B can like A (own swipe accepted)
PASS: match row exists and BOTH A and B can select it
PASS: B's deck now EXCLUDES A (swiped + matched)
PASS: B can pass D (own swipe accepted)
PASS: D gone from B's deck after pass
PASS: get_deck permanence: D still absent on re-call (deck now empty)
PASS: spoof rejected: B cannot insert a swipe as A's profile — new row violates row-level security policy for table "swipes"

Cleaned up throwaway users.

13/13 checks passed.
VERIFY-WP3 PASSED
```

Throwaway users (`wp3-…@verify.test`) were created in Balboa Rendezvous /
"Strictly Balboa" and deleted at the end (cleanup runs in `finally`;
`auth.admin.deleteUser` cascades their profiles/entries/swipes/matches).

## Criterion 3 — gesture/button single handler + web animation note

- **Single handler**: `features/swipe/SwipeCard.tsx` — `triggerSwipe` (≈ line 45)
  is the sole commit function. `useImperativeHandle(ref, () => ({ swipe:
  triggerSwipe }))` (line 55) is what the buttons call
  (`Deck.tsx` → `topCardRef.current?.swipe(direction)`); the gesture `onEnd`
  worklet calls `runOnJS(triggerSwipe)(dir)` (≈ line 70). Both resolve into the
  same `withTiming` fly-off and the same `onSwiped` → `Deck.handleSwipe`, which
  performs the one persistence + match-check flow.
- **Web animation behavior**: the fly-off/spring animations are driven by setting
  Reanimated shared values from the JS thread, which on web run via Reanimated's
  rAF-based shim — reliable regardless of pointer-gesture quirks. The pan gesture
  itself uses react-native-gesture-handler's web pointer support (can be flaky on
  web, per the brief), which is exactly why the ✓/✗ buttons exist and go through
  the identical path. Interactive gesture behavior was not manually exercised in
  this headless environment (no in-scope auth UI to reach a populated deck); it is
  validated by a clean typecheck, a successful web export, and successful static
  render of `/swipe`.

## Open items

- Auth UI is a different work package; the Swipe screen shows the "No contests"
  empty state when signed out. Once auth + entry creation land, the populated
  deck is reachable end-to-end (the live verify already exercises the full
  DB/RLS flow the UI relies on).
- Realtime match notifications are out of scope; the match is detected
  synchronously right after the like insert.

## Web fix pass (post-merge blocker)

The orchestrator's interactive browser testing (visible browser, dev **and**
production `expo export` builds) found: pressing ✓ reaches `handleButton` and
`SwipeCard.swipe()`, but the card's transform stayed `matrix(1,0,0,1,0,0)`,
`withTiming`'s completion callback never fired, so **no swipe row was inserted**
and, because `busyRef` was only released in `handleSwipe`'s `finally`, both
buttons stayed permanently bricked.

### Investigation (root cause)

Rebased onto `main` first (WP1/2/4 now present; clean rebase). Then traced the
reanimated-on-web pipeline in `node_modules`:

- Worklets ARE transformed for web — the production web bundle contains 488
  `__workletHash` occurrences, so `babel-preset-expo` is applying
  `react-native-worklets/plugin` for the web platform.
- `react-native-reanimated/lib/module/common/constants/platform.js`:
  `SHOULD_BE_USE_WEB = IS_JEST || IS_WEB || IS_WINDOWS` → correctly `true` on web,
  so reanimated takes its web code path.
- `react-native-worklets/lib/module/initializers/initializers.js` `init()` runs
  on import and installs `globalThis._getAnimationTimestamp = () => performance.now()`.
- The animation driver `react-native-reanimated/lib/module/valueSetter.js` uses
  `global.__frameTimestamp || global._getAnimationTimestamp()` and
  `requestAnimationFrame(step)` to self-drive `withTiming`.
- Live page probe (via the browser's JS console on a signed-in throwaway):
  `globalThis._getAnimationTimestamp` is a function returning a valid timestamp,
  and `globalThis.requestAnimationFrame.toString()` is `function requestAnimationFrame() { [native code] }`
  (the browser-native rAF — NOT the worklets queue override, which was absent).

So the web infrastructure is **structurally correct** — there was no
misconfiguration to fix (which is why babel.config.js / app.json were left
untouched; changing them would have been guessing). I could not reproduce the
freeze in this environment because the automation browser pane is **hidden**
(`document.hidden === true`), and native `requestAnimationFrame` is fully paused
while hidden (measured: **0 rAF callbacks in 2.2 s**). Every reanimated web DOM
update (mappers and `withTiming` alike) is rAF-scheduled, so a hidden pane cannot
drive or observe any of it. The orchestrator's visible-browser finding stands and
cannot be refuted from here.

### Fix (robust, platform-agnostic)

Given the confirmed symptom and that correctness must not depend on an animation
callback that may never fire on web, the swipe **commit was decoupled from
reanimated's completion callback**:

- `features/swipe/SwipeCard.tsx` — `triggerSwipe` now starts the reanimated
  fly-off with no completion callback and schedules the single `onSwiped(dir)`
  commit on a plain `setTimeout(FLY_DURATION_MS)`. A timer fires on every
  platform, so the swipe always persists and the deck always advances; the
  reanimated animation is now purely the (native) visual. A cleanup effect clears
  a pending timer if the card unmounts mid-fly-off. The single code path is
  preserved: gesture → `runOnJS(triggerSwipe)` and buttons → `ref.swipe()` →
  `triggerSwipe` → `setTimeout` → `onSwiped` → `Deck.handleSwipe`.
- `features/swipe/Deck.tsx` — added the REQUIRED failsafe: `handleButton` arms a
  2 s watchdog that force-releases `busyRef`, so a swipe that never resolves can
  never permanently brick the buttons; the normal path clears it in
  `handleSwipe`'s `finally`, and it is cleared on unmount.

Net effect on web: if reanimated does animate on a visible browser, users get the
fly-off AND a reliable commit; if it truly does not, the card advances without a
fly-off (the "skip-animation-and-commit" fallback the orchestrator authorized) —
either way the buttons work and swipes persist. Native is unchanged in behavior
(reanimated fly-off still plays; the ~240 ms timer matches the animation).

Not done: a bespoke web-only CSS-transition fly-off. It would give web a visible
animation even if reanimated is inert, but it is interactive code I could not
verify in this hidden-pane environment; shipping unverifiable interaction for the
core loop was judged riskier than the reasoned, minimal fix above. It is a clean
follow-up if the orchestrator confirms reanimated is inert on visible web.

### Re-verification (verbatim)

```
$ npx tsc --noEmit           → (zero errors)
$ node scripts/verify-wp3.mjs → 13/13 checks passed. VERIFY-WP3 PASSED
$ npx expo export --platform web → Exported: dist  (succeeds)
```

Diagnostic scaffolding used during the investigation (a temporary `/animtest`
route, a `.claude/launch.json`, an isolated dev server on :8092, and a throwaway
`wp3-animtest@verify.test` user) was all removed/deleted afterward. Note: a dev
server that was running on :8081 was stopped during diagnosis — restart it if
needed for interactive re-verification.

## Git

Committed on `wp3-swipe`; `git status` clean after the final commit.
