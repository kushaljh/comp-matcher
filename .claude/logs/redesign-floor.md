# Redesign — THE FLOOR (swipe)

Branch: `redesign-floor` (worktree `comp_matcher-wp3`), on top of the redesign
kernel. Visual source of truth: the art-deco "supper club" mock
(`redesign.dc.html`, sections THE FLOOR / stamps / actions / empty states /
right rail / match celebration + the embedded script's interaction logic).

## Scope

Everything under `features/swipe/**` and `app/(tabs)/swipe/**`. Nothing in
`theme/`, `lib/`, `supabase/`, other features, or `package.json` was touched.

| File | What |
| --- | --- |
| `features/swipe/ContestStubs.tsx` | new — ticket stubs (replaces `ContestPicker.tsx`) |
| `features/swipe/Decor.tsx` | new — bulbs, confetti, rise-in |
| `features/swipe/ExpandedCard.tsx` | new — the full card |
| `features/swipe/FloorAside.tsx` | new — the wide-layout right rail |
| `features/swipe/tint.ts` | new — `withAlpha()` for the design's `rgba(ink, .11)` washes |
| `features/swipe/CardContent.tsx` | rewritten — card face, `Monogram`, `ScrimRamp` |
| `features/swipe/SwipeCard.tsx` | restyled — stamps, r(24), tap-to-expand |
| `features/swipe/Deck.tsx` | rewritten — peek layers, actions, undo, notices, empty state, shortcuts |
| `features/swipe/MatchOverlay.tsx` | rewritten — "You've got a partner" |
| `features/swipe/data.ts` | `useMyFace` +role, `useDeckCounts`, `useContestStats`, `deleteOwnPass`, exported query keys |
| `features/swipe/types.ts` | `DanceRole`, `MyProfileFace`, `UndoEntry` |
| `app/(tabs)/swipe/index.tsx` | rewritten — stub row, deck column, wide layout, no-entry panel |
| `features/swipe/Chip.tsx`, `ContestPicker.tsx` | deleted — orphaned by the rewrite |

## Invariants preserved

- **The commit still runs on a plain `setTimeout`, never on an animation
  callback.** `SwipeCard.triggerSwipe` starts the reanimated fly-off and
  schedules `onSwiped` on a JS timer. Reanimated's timed animations do not tick
  in the web bundle on this stack, so gating the commit on them silently drops
  swipes. Under `reduceMotion` the duration is 0 — still a timer, still one path.
- **`busyRef` + the 2s watchdog in `Deck`** are unchanged: `commit()` takes the
  lock, `handleSwipe`'s `finally` releases it, the watchdog releases it anyway.
- **One commit path.** Gesture flick, ✕/✓ buttons and ←/→ keys all call
  `SwipeCard.swipe()` via the imperative handle. Pressing a button while the
  full card is open collapses it and goes through the same path.
- **Optimistic re-seed guard.** `prevCardsRef` still only re-seeds the local
  stack when the query hands back a genuinely new array.

## Kernel colour gaps fixed

Every text style in the swipe files now carries an explicit `useTheme()` colour
and every `fontSize` goes through `fs()`. The kernel's known near-black-on-dark
leftovers (`ContestPicker.event`/`contest`, `Chip.text`, `Deck.circleGlyph`,
`MatchOverlay.heart`, `SwipeCard.badgeText`) are gone with those files/styles.
Verified in-browser: a sweep of all 150 leaf text nodes on the floor in dark
mode found **zero** with a luminance under 70.

## Decisions

- **Stub counts: one `get_deck` per entered contest, sharing `useDeck`'s cache
  key.** `useDeckCounts` runs `useQueries` against `['swipe','deck',id]`, so
  every stub shows a real "N on the floor" and selecting a stub is a cache hit
  rather than a second fetch. The *active* stub instead shows the deck's live
  local remaining (reported up through `onRemainingChange`), so it follows
  swipes that haven't been refetched yet.
- **Undo a pass deletes the row, then marks the deck stale with
  `refetchType: 'none'`.** `get_deck` has no `ORDER BY`; an immediate refetch
  could drop the recovered card back into the middle of the pile instead of on
  top. The next screen focus (which already refetches) reconciles.
- **Undo pops the stack before awaiting the delete**, and rolls back on failure
  — a double-tap can never delete or reinsert twice. `deleteOwnPass` repeats the
  `direction = 'pass'` filter client-side so a stale stack can never aim it at a
  like.
- **Card role line is derived, not fetched.** `get_deck` only ever returns the
  opposite role, so `useMyFace` picks up `role` and the deck labels every card
  "Follower · novice" from that. No extra query, no fabricated fallback (it
  degrades to the division alone while the profile loads).
- **`Animated` (RN, JS driver) for bulbs / confetti / rise-in, not reanimated.**
  Reanimated's timed animations don't run in the web bundle here (the same fact
  the swipe-commit timer exists for), which would leave the bulbs frozen and the
  confetti parked at the top of the screen. Still frames are the *lit* state
  (opacity 1), so the reduce-motion / no-rAF frame reads correctly.
- **Peek layers are decorative, and count-aware.** The design draws both
  unconditionally; here the `.95` layer appears at 2+ cards and the `.34` layer
  at 3+, so the pile never lies about its depth.
- **The wide layout opts out of `Screen`'s 520px canvas locally** by passing a
  `maxWidth` override in `style` — no change to `theme/components.tsx`.

## Compromises vs. the design

| Design | Here | Why |
| --- | --- | --- |
| Gradient scrim over the photo | `ScrimRamp`: four 13px bands of `scrim` at .18/.42/.7/.9, then a solid block | No gradient primitive; adding `expo-linear-gradient` is out of scope |
| `repeating-conic-gradient` fan + diagonal film-grain over the photo | Omitted | RN has no conic gradient and no cheap repeating pattern |
| Multi-ring `box-shadow` (`0 0 0 1px X, 0 0 0 6px Y`) on buttons and stamps | One 1px border inside a tinted padded halo view | RN shadows can't do multi-ring spreads |
| Photo segment bars + gallery + tap-left/right paging | Omitted | Profiles carry exactly one `photo_url`; there is nothing to page |
| Card's right column (city / "6 yrs in") | Omitted | Not in the schema |
| "Floor footage" clips block on the full card | Omitted | Not in the schema; the entry `note` takes that slot instead |
| Tap outer thirds = prev/next photo | Outer thirds inert; only the middle band expands | Same reason — kept the design's middle-band rule so the card's own hint stays true |
| Status "N of M" where M = everyone in the division | M = the deck as last fetched (unswiped candidates) | The client never sees already-swiped candidates; `get_deck` filters them server-side |
| Dragging the *expanded* card to swipe it | Not draggable; ✕/✓ still act on it and collapse it | Kept the drag rig single-headed rather than duplicating it for the overlay |
| `␣` next photograph shortcut | Dropped from the rail and the handler | No gallery |
| Right rail on the "no contest" screen | Rail hidden there | Nothing to tally without a program |
| `animation: bulb/drift/riseIn` CSS | RN `Animated` equivalents | See Decisions |

## Verification

```
npx tsc --noEmit
  (no output — 0 errors)

npx expo export --platform web
  ...
  /(auth)/forgot-password (25KB)
  /(auth)/onboarding (25KB)

  Exported: dist

node scripts/verify-wp3.mjs
  Using contest Strictly Balboa @ California Balboa Classic (b2222222-0000-4000-8000-000000000001)
    divisions: novice, amateur, advanced, open

  PASS: B's deck contains A and D — deck=5 card(s)
  PASS: B's deck EXCLUDES C (wrong division)
  PASS: B's deck EXCLUDES B and E (same role)
  PASS: A can like B (own swipe accepted)
  PASS: no match row after only A liked
  PASS: B's deck STILL contains A (B hasn't swiped)
  PASS: B can like A (own swipe accepted)
  PASS: match row exists and BOTH A and B can select it
  PASS: B's deck now EXCLUDES A (swiped + matched)
  PASS: B can pass D (own swipe accepted)
  PASS: D gone from B's deck after pass
  PASS: get_deck permanence: D still absent on re-call
  PASS: spoof rejected: B cannot insert a swipe as A's profile — new row violates row-level security policy for table "swipes"

  Cleaned up throwaway users.

  13/13 checks passed.
  VERIFY-WP3 PASSED
```

### Browser pass

`dist/` served on :8094 by a node static server. Throwaway cast created for the
interactive checks (`floor-follow@verify.test` follower/novice, plus leaders
`floor-lead-a/b/c@verify.test`) entered in Camp Hollywood · Strictly Lindy and
· Strictly Balboa, with `floor-lead-a` pre-liking the follower so a mutual could
fire. **All throwaways deleted afterwards** (`deleteUser` cascades every swipe
row, including those that targeted fixture/demo profiles). No swipe was ever
made *as* a fixture or demo account.

Live-DB round trips confirmed with the service role between browser steps:

- **Deck renders (1280px):** stub row `CAMP HOLLYWOOD / STRICTLY LINDY /
  "6 on the floor · novice"` and a second stub for Strictly Balboa; card shows
  the monogram, `NO PHOTOGRAPH ON FILE`, `LEADER · NOVICE`, the name in DM
  Serif, value pills, the "TAP THE MIDDLE FOR THE FULL CARD" hint, both stamps;
  ✕ ↺ ✓ row; status `6 OF 6 STILL ON THE FLOOR · DRAG OR USE THE BUTTONS`.
- **Right rail at 1280px:** WORK THE FLOOR FAST + 4 kbd chips, THIS PROGRAM
  0 ASKED / 0 PAIRED, HOUSE RULES. Absent at 375px; bottom tab bar present
  instead; `document.scrollWidth === 375` (no horizontal overflow); card
  343×452.
- **Peek layers:** two decorative layers measured as
  `matrix(0.9,0,0,0.9,0,23.4)` @ opacity .34 on `surface` and
  `matrix(0.95,0,0,0.95,0,12.35)` on `photoBg`.
- **Full card:** middle tap opens it — name, `LEADER · NOVICE`, bio, entry note,
  COMPETITION RECORD (`2025 / Strictly Lindy / CAMP HOLLYWOOD / 3RD`), the
  sealed-contacts box, `↓ CLOSE THE CARD`. `↑` opens, `Esc` and `↓` close. The
  96px monogram measured fully inside the 212px header (248→344 within 190→402,
  centred).
- **Pass commits:** `←` → top card changed, status `5 OF 6`, active stub
  `5 on the floor`. DB: exactly one row, `direction=pass`.
- **Undo a pass round-trips:** `Z` → the same card back on top, status `6 OF 6`,
  stub back to 6. DB: `swipes: (none)` — the row was **deleted**.
- **Undo after a like refuses:** `→` (like) then `Z` → status line replaced by
  the notice pill `THAT ASK IS ALREADY ON THEIR CARD — RETRACT IT FROM YOUR
  DANCE CARD.`, which auto-dismissed; the like row survived and `ASKED` stayed
  at 1.
- **Match celebration:** ✓ **button** on the pre-liking leader → "You've got a
  partner", `STRICTLY LINDY · CAMP HOLLYWOOD`, `F · & · A` roundels, copy,
  OPEN THE DANCE CARD / BACK TO THE FLOOR. Rail went to `2 ASKED / 1 PAIRED`.
  `Esc` dismissed it and left the deck intact.
- **Empty state:** passing the last cards → `That's the whole floor`, the
  contest-named copy, TAKE BACK A PASS + ANOTHER PROGRAM, status `FLOOR
  CLEARED`, stub `0 on the floor`. TAKE BACK A PASS restored the card
  (`1 OF 6`) and deleted its row from the DB.
- **No-entry state:** with the follower's entries removed →
  `No contest, no floor` + copy + BROWSE THE SEASON, status `ENTER A CONTEST TO
  OPEN THE FLOOR`, 7 brass 8px bulbs.
- **Contest switching:** tapping the Strictly Balboa stub swapped the deck
  (`5 OF 5`) and both stub counts stayed right (`0` / `5`).
- **Theme + text scale:** with `{mode:'light', textScale:1.25}` the name
  computed `rgb(32,20,15)` (light `ink`) at 43.75px (= 35 × 1.25) in
  DMSerifDisplay; role line light brass at 11.25px in mono; ASKED light `ink2`
  at 13.75px in Barlow Semi Condensed; stamp light brass at 23.75px in
  Limelight. Every sampled size scales → `fs()` coverage is complete.
- **reduceMotion:** with `reduceMotion:true` a `←` commit still landed the row
  in the DB (`C Cyril Vance=pass`) and the empty state rendered — commits are
  unaffected by the motion setting.
- **Fixture account (read-only):** signed in as `follower1@fixture.test` — the
  floor renders with the new styling (California Balboa Classic · Strictly
  Balboa · "3 on the floor · novice", Leo Leader's card, rail at 0/0). Only the
  ↑/Esc keys were used; **no swipe was committed as the fixture**, and the
  session was cleared afterwards.
- **Console:** no errors or warnings across the whole session.

### Not verified

- **Drag.** The Browser pane does not composite frames here, and neither the
  harness's synthetic input nor hand-dispatched `PointerEvent`s activate
  react-native-gesture-handler. RNGH *is* attached (the card computes
  `touch-action: none; user-select: none`), and the pan body is unchanged from
  the previously-working version apart from the vertical damping and a
  0.28 → 0.26 threshold; the new piece is `Gesture.Exclusive(pan, tap)`, the
  documented pan-priority composition. The fling calls the same `triggerSwipe`
  that the verified button and key paths call.
- **Animation.** `requestAnimationFrame` fired **0 times in 4.4s** in the pane,
  so the bulbs/confetti/rise-in loops could not tick. They were confirmed to
  render their still frame correctly (7 brass dots at opacity 1, the expanded
  card fully laid out). Motion itself is unproven; it is the standard RN
  `Animated` timing driver, which does run in a real browser.
- **Native (iOS/Android).** Web export only.
- **Live viewport resize across 1080px.** `useWindowDimensions()` does not
  update when the harness overrides viewport metrics (no `resize` event reaches
  RN Web); both layouts were verified by loading at each width instead.
- Screenshots were unavailable (pane not composited), so every visual claim
  above is a computed-style / geometry / DOM assertion rather than eyeballed
  pixels.

### Accessibility note (not a regression, worth knowing)

The ✕ / ↺ / ✓ buttons expose `Sit this one out` / `Take back a pass` /
`Ask 'em to dance`, and the stubs expose a selected state. The card itself is a
`GestureDetector` view with no role, so "open the full card" has no
screen-reader affordance on touch platforms — same structure as the design, and
the same as before this change.
