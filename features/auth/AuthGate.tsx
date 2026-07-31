// Auth gate: wired into app/_layout.tsx above the root Stack.
//
// Redirect rules:
//   no session                    -> (auth)/sign-in (including away from
//                                    onboarding, which requires a session)
//   session + recovering          -> (auth)/reset-password  (checked FIRST: a
//                                    recovery link carries a real session)
//   session, no app_members row   -> (auth)/invite
//   session, no profiles row      -> (auth)/onboarding
//   session + profile             -> away from (auth) group (tabs)
//
// The membership rung sits above the profile rung because it is the stricter
// gate: without an app_members row the profiles_insert policy rejects the
// onboarding write, so sending an uninvited session to onboarding would just
// dead-end it there.
//
// While the initial session bootstrap (or, once a session exists, the
// membership and has-profile checks) is in flight, renders a blank cream
// screen instead of `children` — this is what prevents a flash of protected
// content (or of sign-in) before the auth state is actually known.
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
import { useHasMembership } from './useHasMembership';
import { useHasProfile } from './useHasProfile';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, initializing, recovering } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const { data: hasMembership, isLoading: membershipLoading } = useHasMembership();
  const { data: hasProfile, isLoading: profileLoading } = useHasProfile();

  // useSegments()'s inferred tuple type is narrower than the actual runtime
  // array (its length depends on which route matched), so widen it before
  // indexing past what TS thinks is the tuple's end.
  const segmentList = segments as readonly string[];
  const inAuthGroup = segmentList[0] === '(auth)';
  const inOnboarding = inAuthGroup && segmentList[1] === 'onboarding';
  const inInvite = inAuthGroup && segmentList[1] === 'invite';
  // sign-in/sign-up/forgot-password: the only (auth) screens that are valid
  // WITHOUT a session. onboarding and invite both need a session (onboarding
  // reads session.user.id, invite redeems as auth.uid()), so neither may be
  // treated as a safe no-session destination — otherwise signing out from one
  // would never redirect back to sign-in.
  const inSignInFlow = inAuthGroup && !inOnboarding && !inInvite;
  const inResetPassword = inAuthGroup && segmentList[1] === 'reset-password';
  const loading = initializing || (!!session && (membershipLoading || profileLoading));

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

    // Stricter than the profile check below, so it comes first: an uninvited
    // session cannot create a profile at all (profiles_insert requires an
    // app_members row), so onboarding would be a dead end for it.
    if (!hasMembership) {
      if (!inInvite) router.replace('/(auth)/invite');
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
    hasMembership,
    hasProfile,
    inAuthGroup,
    inOnboarding,
    inInvite,
    inSignInFlow,
    inResetPassword,
    router,
    segments,
  ]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return <>{children}</>;
}
