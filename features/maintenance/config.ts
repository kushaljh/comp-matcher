// The maintenance-mode switch, read by app/_layout.tsx.
//
// THE SWITCH LIVES IN VERCEL, NOT IN THIS FILE. To take the site down, set
//
//     EXPO_PUBLIC_MAINTENANCE_MODE = true
//
// in Project Settings -> Environment Variables (Production), then Redeploy.
// Unset it and redeploy to bring the site back. true/1/on take it down;
// anything else, including unset, serves the app. Do NOT flip the constant
// below to take the site down — keeping one switch means the site's real
// state is never contradicted by a stale commit.
//
// Why it still needs a redeploy: the web build is a static Expo export with
// no server, so EXPO_PUBLIC_* values are inlined into the bundle at build
// time. That is the trade we want. Nothing is fetched to decide whether we
// are down, so the holding screen keeps working when the backend is the very
// thing that is broken — which a Supabase-backed flag could not do.
//
// Admins can still get in while it is on: see ./backstage.
//
// One sharp edge, already handled: Metro's transform cache does not key on
// EXPO_PUBLIC_* values, so a rebuild over a warm cache re-emits the PREVIOUS
// inlined value and the switch silently does nothing. Vercel builds in a
// fresh container (the cache lives in /tmp, which is never restored), so it
// cannot bite there — but vercel.json passes `--clear` anyway, since it costs
// nothing on a cold container and the failure mode is a maintenance switch
// that quietly stops working. Locally, always build with --clear when
// changing this variable.

/**
 * What ships when the Vercel variable is absent. Pinned off — this is the
 * fallback, not the control.
 */
const FALLBACK = false;

const raw = process.env.EXPO_PUBLIC_MAINTENANCE_MODE?.trim().toLowerCase();

export const MAINTENANCE_MODE =
  raw === undefined || raw === '' ? FALLBACK : raw === 'true' || raw === '1' || raw === 'on';
