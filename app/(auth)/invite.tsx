// The "signed in, but not let in" screen.
//
// AuthGate parks a session here when it has no app_members row. In practice
// that is one of:
//   * an account that predates invite-only and never finished onboarding
//     (the migration only grandfathered accounts, and this one has no profile
//     to hide behind — profiles_insert now needs a membership);
//   * an account created while the before_user_created hook was off;
//   * someone who signed in on the wrong account, hence the sign-out link.
//
// Redeeming here calls the same claim_invite() the signup trigger uses, so the
// single-use and expiry rules are identical whichever door you come through.

import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { signOut } from '../../features/auth/api';
import { useRedeemInvite } from '../../features/invites/hooks';
import { Button, Screen, TextField } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

export default function InviteScreen() {
  const { colors, fonts, fs } = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const redeem = useRedeemInvite();

  async function handleRedeem() {
    setError(null);
    try {
      await redeem.mutateAsync(code.trim());
      // No navigation here on purpose: invalidating the membership query is
      // what moves AuthGate on, exactly like onboarding does with its
      // has-profile query.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code could not be redeemed.');
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(26),
            letterSpacing: 1,
            color: colors.ink,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          You need an invite
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: fs(14.5),
            lineHeight: fs(22),
            color: colors.ink2,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          Comp Matcher is invite only. If a member sent you a code, enter it here to join.
        </Text>
        <TextField
          label="Invite code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {error ? (
          <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(13), marginBottom: 8 }}>
            {error}
          </Text>
        ) : null}
        <Button
          title="Join"
          onPress={handleRedeem}
          loading={redeem.isPending}
          disabled={!code.trim()}
        />
        <Text
          onPress={() => signOut()}
          accessibilityRole="button"
          style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}
        >
          Sign out
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 32, gap: 8 },
  link: { textAlign: 'center', marginTop: 16 },
});
