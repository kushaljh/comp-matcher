// Where a dancer writes to when the app can't help them from inside the app.
//
// Its own module rather than a literal in SuspendedScreen because the moment
// there are two places that show a support address, they will drift — and a
// support address people are given while locked out is the worst one to have
// stale. One export, one place to change it.

import { Linking } from 'react-native';

export const SUPPORT_EMAIL = 'floormateadmin@gmail.com';

/**
 * A mailto for the support address, with the subject filled in.
 *
 * `accountEmail` goes in the subject because the people who reach this are
 * locked out, and someone appealing a suspension often writes from whatever
 * mail app is to hand rather than the address they signed up with. Without it
 * an admin gets "Suspended account" from an address that matches nothing in
 * the roster.
 */
export function supportMailto(reason: string, accountEmail?: string | null): string {
  const subject = accountEmail ? `${reason} — ${accountEmail}` : reason;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Open the user's mail app. Swallows the failure on purpose: a device with no
 * mail client configured rejects the URL, and the address is rendered as text
 * beside this anyway, so the fallback is "read it and type it" rather than an
 * error the person can do nothing about.
 */
export async function openSupportEmail(reason: string, accountEmail?: string | null): Promise<void> {
  try {
    await Linking.openURL(supportMailto(reason, accountEmail));
  } catch {
    /* no mail client — the address is on screen to copy */
  }
}
