// Auth gate: wired into app/_layout.tsx above the root Stack.
//
// Redirect rules:
//   no session                    -> (auth)/sign-in (including away from
//                                    onboarding, which requires a session)
//   session + recovering          -> (auth)/reset-password  (checked FIRST: a
//                                    recovery link carries a real session)
//   session, no profiles row      -> (auth)/onboarding
//   session + profile             -> away from (auth) group (tabs)
//
// While the initial session bootstrap (or, once a session exists, the
// has-profile check) is in flight, renders a blank cream screen instead of
// `children` — this is what prevents a flash of protected content (or of
// sign-in) before the auth state is actually known.
//
// `useSegments`/`useRouter` work here even though this component sits above
// <Stack> rather than inside a screen, because the navigation context is
// established by expo-router's entry point (expo-router/entry), one level
// above this RootLayout component.

import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { colors } from '../../theme/tokens';
import { useSession } from './SessionProvider';
import { SuspendedScreen } from './SuspendedScreen';
import { useAmSuspended } from './useAmSuspended';
import { useHasProfile } from './useHasProfile';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, initializing, recovering } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const { data: hasProfile, isLoading: profileLoading } = useHasProfile();
  const { data: suspendedAt, isLoading: suspendedLoading } = useAmSuspended();

  // useSegments()'s inferred tuple type is narrower than the actual runtime
  // array (its length depends on which route matched), so widen it before
  // indexing past what TS thinks is the tuple's end.
  const segmentList = segments as readonly string[];
  const inAuthGroup = segmentList[0] === '(auth)';
  const inOnboarding = inAuthGroup && segmentList[1] === 'onboarding';
  // sign-in/sign-up/forgot-password: the only (auth) screens that are valid
  // WITHOUT a session. onboarding needs a session (it reads session.user.id),
  // so it must NOT be treated as a safe no-session destination — otherwise
  // signing out while on onboarding would never redirect back to sign-in.
  const inSignInFlow = inAuthGroup && !inOnboarding;
  const inResetPassword = inAuthGroup && segmentList[1] === 'reset-password';
  const loading = initializing || (!!session && (profileLoading || suspendedLoading));

  useEffect(() => {
    if (loading) return;

    if (!session) {
      if (!inSignInFlow) router.replace('/(auth)/sign-in');
      return;
    }

    // A recovery link attaches a real session, so this check must come BEFORE
    // the has-profile and in-auth-group rules below — otherwise the gate reads
    // it as an ordinary sign-in and bounces the user into the tabs without
    // ever letting them set a password.
    if (recovering) {
      if (!inResetPassword) router.replace('/(auth)/reset-password');
      return;
    }

    if (!hasProfile) {
      if (!inOnboarding) router.replace('/(auth)/onboarding');
      return;
    }

    if (inAuthGroup) router.replace('/(tabs)/swipe');
    // `segments` is included even though the booleans above are derived from
    // it: they can be unchanged (e.g. false -> false) across a segments
    // change that still matters (e.g. "/" -> "/events"), which would
    // otherwise skip a needed re-evaluation.
  }, [
    loading,
    session,
    recovering,
    hasProfile,
    inAuthGroup,
    inOnboarding,
    inSignInFlow,
    inResetPassword,
    router,
    segments,
  ]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  // Rendered in place of the app rather than routed to: there is no suspended
  // route to guard, and the screen's own sign-out is the only way out of it.
  // Sits after the redirect rules above so a suspended dancer mid-password-
  // recovery still gets to finish setting their password.
  if (session && !recovering && hasProfile && suspendedAt) {
    return <SuspendedScreen since={suspendedAt} />;
  }

  return <>{children}</>;
}
