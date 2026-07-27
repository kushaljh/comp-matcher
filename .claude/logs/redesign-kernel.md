# Redesign kernel — theme system, fonts, app shell, Settings

Branch: `redesign-kernel` (worktree `comp_matcher-wp1`). Source of truth for the
visuals: the art-deco "supper club" design mock (`redesign.dc.html`).

## Scope

Foundation only. Delivered:

- `theme/palette.ts`, `theme/fonts.ts`, `theme/ThemeProvider.tsx` — the themed
  system (two palettes, radii, five font families, text scale, reduce motion).
- `theme/tokens.ts` — back-compat shim; same export surface as before, values
  remapped onto the dark palette.
- `theme/components.tsx` — Screen / Button / TextField / Card restyled.
- `app/_layout.tsx` — ThemeProvider + a react-navigation theme bridge.
- `app/(tabs)/_layout.tsx` — rewritten shell: header, left rail, bottom bar.
- `app/(tabs)/settings/index.tsx` — new Settings screen (mine).

Explicitly NOT done (screen agents own these): the Floor's right rail, and any
restyle of swipe / events / matches / profile / admin / auth screens.

## Contract for screen agents

```ts
import { useTheme } from '<...>/theme/ThemeProvider';

const {
  colors,        // bg surface surface2 photoBg ink ink2 brass brassLight red
                 // line cardLine scrim likeBg fieldBg fan
  radii,         // { r: 24, rSm: 16, pill: 999 }
  fonts,         // display deco serif serifItalic body bodyMedium bodySemi
                 // bodyBold condensed condensedSemi mono
  fs,            // (size: number) => number — apply to EVERY fontSize
  textScale,     // 0.9 | 1 | 1.12 | 1.25
  reduceMotion,  // boolean — skip/shorten animations when true
  mode,          // 'system' | 'light' | 'dark'
  resolvedMode,  // 'light' | 'dark'
  setMode, setTextScale, setReduceMotion,
} = useTheme();
```

Font key → family: `display` Limelight, `deco` Poiret One, `serif` /
`serifItalic` DM Serif Display, `body`/`bodyMedium`/`bodySemi`/`bodyBold`
Barlow 400/500/600/700, `condensed`/`condensedSemi` Barlow Semi Condensed
500/600, `mono` platform monospace.

Notes for screen work:

- `fontWeight` does nothing on these faces — pick the family that carries the
  weight (`bodySemi`, not `body` + `fontWeight: '600'`).
- CSS `letter-spacing: .16em` ≈ `letterSpacing: 2` in RN at ~13px. Scale by eye.
- `spacing` / `fontSizes` still live in `theme/tokens.ts` as plain constants;
  they are not part of `useTheme()`.
- Migrating a screen means replacing `theme/tokens` colour imports with
  `useTheme()`. The shim exists only so unconverted screens keep working.

## Decisions

- **ThemeProvider sits above SessionProvider** (inside QueryClientProvider).
  Below AuthGate it would remount whenever auth state flips, re-running font
  loading and prefs hydration. SessionProvider/AuthGate behaviour is untouched.
- **Render is held** on a flat themed `View` until fonts and prefs are both
  ready. `expo-splash-screen` is not installed and adding it was out of budget.
- **Prefs persist as one AsyncStorage key** (`compmatcher.prefs.v1`) holding
  `{ mode, textScale, reduceMotion }`; written only after hydration completes so
  defaults can't clobber stored values.
- **`app.json` `userInterfaceStyle` `light` → `automatic`.** `useColorScheme()`
  is pinned to light on native otherwise, which would make "System" a no-op.
- **react-navigation is themed from our palette** (`ThemedNavigation` in
  `app/_layout.tsx`). Without it, scene backgrounds and the nested Dance Card
  stack header stayed on the library's light default — cream text on #F2F2F2.
- **Header lives in `(tabs)/_layout.tsx`**, not the root layout: the auth flow
  has no shell in the design. It wraps in `SafeAreaView` so the per-screen
  `Screen` (which also takes the top edge) measures zero inset beneath it.
- **Custom `tabBarButton` instead of `tabBarLabel`.** The tab bar substitutes a
  `MissingIcon` ("?") when no `tabBarIcon` is given, and reserves its space;
  replacing the whole button is the only clean way to get label-only tabs.
- **Token remaps that read backwards on dark**, and why:
  `navy`/`cream` → `bg`, `creamDark`/`white` → `surface`, `brassDark` →
  `brassLight` (the emphasis brass is the *lighter* one on dark),
  `textInverse` → `ink` (every usage sits on a dark fill), `border` →
  `cardLine`, `disabled` → `#6E5D4C`.

## Compromises vs. the design

| Design | Here | Why |
| --- | --- | --- |
| Gradient hairline under the header | Three flat segments (line / brass 55% / line) | No gradient primitive available; no new deps |
| `repeating-conic-gradient` fan on the logo roundel | Six rotated 1px brass blades | RN has no conic gradient |
| Swing-out couple logo image | "CM" monogram in DM Serif inside the brass ring | Asset not available |
| Radial glow washes, `box-shadow` rings | Flat `likeBg` fills and 1px borders | RN shadows can't do multi-ring spreads |
| Settings column max-width 620px | 520px (the app's existing web canvas) | Consistency with every other screen |
| Email-OTP delete flow | Existing confirm + `delete_my_account` RPC | Deferred per brief |
| `zoom`-based text scale | `fs()` multiplier on font sizes only | Paddings stay fixed; layout is more predictable |

Known cosmetic gaps left for screen agents (caused by the shim, not worth
touching unconverted screens for): `features/swipe/ContestPicker.tsx` `event` /
`contest` text styles carry no explicit colour, so they render near-black on the
now-dark chip; same for `Chip.tsx` `text`, `Deck.tsx` `circleGlyph`,
`MatchOverlay.tsx` `heart`, `SwipeCard.tsx` `badgeText`,
`DateRangePicker.tsx` `calToggleGlyph`. Eight styles total — all in files a
screen agent will rewrite anyway.

## Verification

```
npx tsc --noEmit          # 0 errors
npx expo export --platform web
                          # succeeded; /settings emitted alongside the existing routes
```

Browser pass — `dist/` served on :8093 by a node static server, signed in as the
repo's seeded fixture account (`scripts/create-fixtures.mjs`):

- Fonts load: `document.fonts` reports `Limelight_400Regular`,
  `DMSerifDisplay_400Regular`, `Barlow_400Regular`,
  `BarlowSemiCondensed_600SemiBold` as `loaded`; the header title computes to
  `font-family: Limelight_400Regular`.
- Five nav destinations present in both layouts. At 1280px: rail shows 01–05,
  bottom bar `display: none`. At 375px: rail absent, bottom bar visible with all
  five labels.
- Active states: rail item = `rgba(233,178,60,.17)` background + 2px brass left
  border + ink label; tab = brass label + 18×2 brass rule.
- Navigation works from both the rail and the bottom bar (`/settings` → `/swipe`
  and back, active state follows).
- Settings: appearance flip is live — title ink goes `#FBF3E2` → `#20140F`,
  shell background `#150C0E` → `#F3EADA`, active pill `#E9B23C` → `#9A6B12`.
  Text size: sample card 21px → 26.25px at Larger (×1.25), header title 19 →
  23.75. All three prefs land in `localStorage['compmatcher.prefs.v1']`.
- Account block shows the signed-in email and `Leader · fixed`; danger zone
  renders in the red inset frame.
- The Floor, The Season, Dance Card, Your Card all render with no console
  errors and no error markers in the DOM.

Two defects found and fixed during this pass:

1. The tab bar passes its button `aria-selected`, **not** `accessibilityState`,
   so no tab ever rendered as active. Fixed in `(tabs)/_layout.tsx`.
2. Nested Dance Card stack header rendered ink-on-#F2F2F2. Fixed by theming
   react-navigation (see Decisions).

Not verified interactively:

- **Native (iOS/Android).** Web export only. The safe-area nesting (header
  `SafeAreaView` above each screen's own) relies on native frame measurement
  subtracting the consumed inset; correct by construction but unproven on device.
- **Live viewport resize across the 1080px breakpoint.** `useWindowDimensions()`
  did not update when the harness overrode viewport metrics (no `resize` event
  reaches RN Web); both layouts verified by loading at each width instead. A real
  browser resize fires `resize` normally.
- **Sign out / delete account were not executed** — both are wired to the
  existing hooks and would have destroyed the fixture account.
- Screenshots were unavailable (browser pane not composited), so all visual
  claims above are computed-style / DOM assertions rather than eyeballed pixels.
