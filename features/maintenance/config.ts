// The maintenance-mode switch, read by app/_layout.tsx.
//
// TO TURN MAINTENANCE OFF: flip MAINTENANCE_DEFAULT to false and redeploy.
//
// EXPO_PUBLIC_MAINTENANCE_MODE overrides the default when it is set, so the
// site can also be flipped from the Vercel dashboard (Settings -> Environment
// Variables) plus a redeploy, without a code change. EXPO_PUBLIC_* values are
// inlined at build time, so either route needs a rebuild — there is no
// runtime toggle here by design: the whole point is that the app makes no
// network calls while it is down.

/** What the app does when EXPO_PUBLIC_MAINTENANCE_MODE is not set. */
const MAINTENANCE_DEFAULT = true;

const raw = process.env.EXPO_PUBLIC_MAINTENANCE_MODE?.trim().toLowerCase();

export const MAINTENANCE_MODE =
  raw === undefined || raw === '' ? MAINTENANCE_DEFAULT : raw === 'true' || raw === '1' || raw === 'on';
