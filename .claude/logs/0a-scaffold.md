# Stage 0a — Expo Scaffold

## Scope given

Scaffold a complete Expo app (latest stable SDK, TypeScript, Expo Router) at the repo root of
`comp_matcher`, with a frozen dependency set (feature agents may not add packages later), a fixed
file structure (`app/(tabs)/{events,swipe,matches,profile}/index.tsx` + shared `lib/` and `theme/`
helpers), and a vintage-swing design token set. Verification is headless: `pnpm install`,
`tsc --noEmit`, `expo export --platform web`. No git commands, no touching `supabase/`, `scripts/`,
or `.claude/logs/0b-database.md` (owned by a parallel agent).

## Decisions made

- **SDK version**: Expo SDK **57** (`expo@57.0.8`, `react-native@0.86.0`, `react@19.2.3`) — this is
  what `create-expo-app@latest` resolved as latest-stable at the time of scaffolding.
- **Scaffold approach**: `npx create-expo-app@latest _scaffold --template blank-typescript` into a
  temp subdirectory, then moved only `package.json`, `app.json`, `tsconfig.json`, and `assets/`
  into the repo root, then deleted `_scaffold/`. Deliberately did **not** carry over the template's
  `App.tsx` / `index.ts` (replaced by Expo Router's `expo-router/entry`), nor its `LICENSE`,
  `CLAUDE.md`, `AGENTS.md`, or `.claude/settings.json` (template metadata/plugin config unrelated
  to the app itself — out of scope for this task, and not something to silently fold into the
  project's Claude configuration).
- **`.gitignore`**: no changes needed — the repo's existing `.gitignore` already covered
  `node_modules/`, `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts`. Did not touch `.npmrc` or
  `.env.example` per hard rules.
- **`package.json`**: renamed `"name"` to `comp-matcher`, set `"main": "expo-router/entry"`.
- **`app.json`**: name "Comp Matcher", slug "comp-matcher", scheme "compmatcher", `newArchEnabled:
  true`, `web: { bundler: "metro", output: "static", favicon: "./assets/favicon.png" }`. Kept the
  default template icon/splash/adaptive-icon assets as placeholders. `expo install` auto-appended
  `expo-image` and `expo-web-browser` to the `plugins` array (their config plugins were
  auto-detected) — left as-is.
- **Dependency install**: used `npx expo install <pkg>` for every package in the frozen list so
  versions are matched to SDK 57.
- **Extra dependency beyond the spec's list: `react-native-worklets`.** `react-native-reanimated`
  4.x's babel plugin (`react-native-reanimated/plugin`) does a hard
  `require('react-native-worklets/plugin')` internally, and lists `react-native-worklets` as a
  **peer dependency**, not a transitive one. Without installing it explicitly, `require.resolve`
  failed (`Cannot find module 'react-native-worklets/plugin'`). Added it via
  `npx expo install react-native-worklets` (resolved to `0.10.0`). This was necessary for
  correctness, not a scope-creep addition — reanimated is unusable without it.
- **Reanimated babel plugin**: did **not** manually add a plugin entry to `babel.config.js`.
  Inspected `babel-preset-expo@57.0.4`'s source
  (`build/configs/expo.js`) and confirmed it now **auto-detects and injects** the
  `react-native-worklets/plugin` (which is what `react-native-reanimated/plugin` re-exports) when
  the package is installed. Manually adding it too would risk a duplicate-plugin babel error.
  `babel.config.js` is therefore just the standard `{ presets: ['babel-preset-expo'] }`. This
  satisfies "configure the reanimated babel plugin" for SDK 57's actual mechanism.
- **Root route fix (`app/index.tsx`)**: the spec's exact tab layout has no file at `(tabs)/index.tsx`
  — each tab lives one segment deeper (`/events`, `/swipe`, etc.). A first `expo export --platform
  web` confirmed this: the static route list had no `/` and no `dist/index.html`, meaning app
  launch (native and web) would hit the not-found screen. Added a minimal
  `app/index.tsx` with `<Redirect href="/events" />` (outside all four tab directories, so it
  doesn't touch any feature agent's owned directory) to fix this. Re-ran the export to confirm `/`
  now resolves.
- **Theme**: `theme/tokens.ts` holds a warm vintage-swing palette (deep navy `#1B2430`, cream
  `#F6F1E7`, brass/gold accent `#C7972C`, muted red `#8C3B2E` for destructive), a spacing scale,
  radii, and font sizes/weights. `theme/components.tsx` implements `Screen`, `Button` (primary /
  secondary / destructive, loading + disabled states), `TextField` (label + error text), and
  `Card`, all with plain `StyleSheet` and typed props — no UI library.
- **`lib/supabase.ts`**: reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
  `process.env`, throws a clear `Error` at import time if either is missing, imports
  `react-native-url-polyfill/auto`, and branches on `Platform.OS === 'web'` to omit the
  `AsyncStorage` `storage` option on web (falls back to supabase-js's default `localStorage`) while
  using `AsyncStorage` on native. `persistSession: true`, `autoRefreshToken: true`,
  `detectSessionInUrl: false` on both branches.
- **`lib/database.types.ts`**: exact placeholder text requested — `export type Database = any;`
  with the generated-file warning comment.

## Files created / modified

Created:
- `babel.config.js`
- `app/_layout.tsx`
- `app/index.tsx` (root → `/events` redirect; see decision above)
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/events/index.tsx`
- `app/(tabs)/swipe/index.tsx`
- `app/(tabs)/matches/index.tsx`
- `app/(tabs)/profile/index.tsx`
- `lib/supabase.ts`
- `lib/database.types.ts`
- `lib/queryClient.ts`
- `theme/tokens.ts`
- `theme/components.tsx`
- `features/README.md`
- `.claude/logs/0a-scaffold.md` (this file)

Moved from the temp scaffold into the repo root, then edited:
- `package.json` (renamed, `main` set to `expo-router/entry`, all deps added)
- `app.json` (name/slug/scheme/newArchEnabled/web config/plugins added)

Moved from the temp scaffold unedited:
- `tsconfig.json`
- `assets/` (icon.png, splash-icon.png, favicon.png, android-icon-{foreground,background,monochrome}.png)

Generated (gitignored, not hand-authored):
- `pnpm-lock.yaml`
- `node_modules/`
- `.expo/`
- `dist/` (from the web export — safe to delete/regenerate)

Not touched (owned by the parallel database agent, confirmed present but left alone):
- `supabase/`, `scripts/`, `.env` (already existed at time of writing this log), `.claude/` (only
  added `.claude/logs/0a-scaffold.md` inside it)

## Verification gate output

### 1. `pnpm install`

Initial install (base template deps):
```
dependencies:
+ expo 57.0.8
+ expo-status-bar 57.0.1
+ react 19.2.3 (19.2.8 is available)
+ react-native 0.86.0

devDependencies:
+ @types/react 19.2.17
+ typescript 6.0.3 (7.0.2 is available)

Done in 2m 40s using pnpm v11.17.0
```

Final confirmation run (after all deps + files added):
```
Already up to date
Done in 1s using pnpm v11.17.0
```

`pnpm-lock.yaml` confirmed present (269,335 bytes).

### 2. `npx tsc --noEmit`

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
TSC_EXIT=0
```
Zero errors. (The `node-linker` warning is npm's own `npx` shim complaining about a pnpm-only
`.npmrc` key — harmless, pnpm itself honors it; not something to remove per the hard rule against
editing `.npmrc`.)

### 3. `npx expo export --platform web`

First run (before the `app/index.tsx` fix) — flagged the missing root route:
```
› Static routes (10):
/_sitemap (17KB)
/+not-found (17KB)
/swipe (26KB)
/events (26KB)
/matches (26KB)
/profile (26KB)
/(tabs)/swipe (26KB)
/(tabs)/events (26KB)
/(tabs)/matches (26KB)
/(tabs)/profile (26KB)

Exported: dist
```

Final run (after adding `app/index.tsx`):
```
env: load .env
env: export EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_SUPABASE_URL SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY
Starting Metro Bundler

Static rendering is enabled. Learn more: https://docs.expo.dev/router/web/static-rendering/
λ Bundled 10001ms ...@expo+router-server.../render.js (1343 modules)
Web Bundled 10843ms ...expo-router.../entry.js (1291 modules)

› web bundles (1):
_expo/static/js/web/entry-bd44aabff841c7f6782f0e9b7b8aa2c3.js (2.2MB)

› Static routes (11):
/ (index) (18KB)
/_sitemap (17KB)
/+not-found (17KB)
/swipe (26KB)
/events (26KB)
/matches (26KB)
/profile (26KB)
/(tabs)/swipe (26KB)
/(tabs)/events (26KB)
/(tabs)/matches (26KB)
/(tabs)/profile (26KB)

Exported: dist
```
`dist/` produced with `dist/index.html` now present. No build errors. The duplicate-looking
`/(tabs)/events` vs `/events` entries are expected Expo Router static-export behavior for routes
inside a group (`(tabs)`) — both paths render the same screen.

The `env: load .env` line shows the parallel database agent's `.env` file exists and is
already gitignored; I did not create, read the contents of, or modify it.

## Left open / notes for downstream agents

- `expo-env.d.ts` (Expo Router's generated route-typing file) has not been generated yet — it's
  created the first time someone runs `expo start` locally, and is already gitignored. Not needed
  for `tsc --noEmit` or `expo export` to pass.
- `lib/database.types.ts` is a placeholder (`Database = any`) until Stage 0 join runs
  `supabase gen types` against the schema the parallel database agent is building.
- `dist/` from the verification export is left on disk (gitignored); safe to delete.
- No native `ios/`/`android/` folders were generated (no `expo prebuild` run) — not required by the
  spec, and dev servers/emulators were intentionally not started.
