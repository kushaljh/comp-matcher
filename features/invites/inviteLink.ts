// Where an invite code gets shared to. Same web-vs-native split as
// features/auth/api.ts's resetRedirectTo(): on web the deployed (or dev)
// origin, on native the app's `compmatcher://` scheme, which expo-linking
// builds for us.
//
// The link lands on the sign-up screen with ?code=... prefilled — see
// app/(auth)/sign-up.tsx. AuthGate lets a session-less visitor sit there,
// because sign-up is part of the no-session flow.

import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export function inviteLink(code: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/sign-up?code=${encodeURIComponent(code)}`;
  }
  return Linking.createURL('/sign-up', { queryParams: { code } });
}

/** The message people actually paste into a DM. */
export function inviteMessage(code: string): string {
  return `Join me on Comp Matcher — it's invite only. Your code is ${code}: ${inviteLink(code)}`;
}

/**
 * Hand the invite off to wherever the user wants it. Platform-branched for the
 * same reason confirmAsync() in features/profile/confirm.ts is: react-native's
 * Share is a stub on web. Returns the label to flash back at the user, since
 * "Shared" and "Copied" are different promises to make.
 */
export async function shareInvite(code: string): Promise<'Shared' | 'Copied'> {
  const message = inviteMessage(code);

  if (Platform.OS !== 'web') {
    await Share.share({ message });
    return 'Shared';
  }

  // navigator.share is the better experience on mobile web but is absent on
  // most desktop browsers, and it rejects if the user dismisses the sheet —
  // fall through to the clipboard in both cases.
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text: message });
      return 'Shared';
    } catch {
      /* dismissed or unsupported — copy instead */
    }
  }

  await navigator.clipboard.writeText(message);
  return 'Copied';
}
