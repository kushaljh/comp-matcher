// Shown in place of the whole app while an admin has the dancer suspended.
//
// RLS is what actually enforces suspension; this exists so the experience is an
// explanation rather than a puzzle — empty decks and silently-failing swipes
// with no reason given.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignOut } from '../profile/hooks';
import { Screen } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

export function SuspendedScreen({ since }: { since: string }) {
  const { colors, fonts, fs, radii } = useTheme();
  const signOut = useSignOut();

  return (
    <Screen style={styles.screen}>
      <View style={[styles.panel, { borderColor: colors.line, borderRadius: radii.r }]}>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: fs(9),
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            color: colors.red,
          }}
        >
          Account suspended
        </Text>

        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(26),
            lineHeight: fs(32),
            letterSpacing: 1.1,
            color: colors.ink,
            textAlign: 'center',
          }}
        >
          You&apos;re off the floor
        </Text>

        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: fs(14.5),
            lineHeight: fs(23),
            color: colors.ink2,
            textAlign: 'center',
            maxWidth: 330,
          }}
        >
          An organiser suspended this account on {new Date(since).toLocaleDateString()}. You
          won&apos;t appear in anyone&apos;s deck and can&apos;t pair up while that stands.
          {'\n\n'}
          Nothing has been deleted — your entries and pairings are still here if the suspension is
          lifted. Get in touch with the organisers if you think this is a mistake.
        </Text>

        <Pressable
          onPress={() => signOut.mutate()}
          disabled={signOut.isPending}
          accessibilityRole="button"
          style={[styles.button, { borderColor: colors.line, borderRadius: radii.rSm }]}
        >
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(13),
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: colors.ink,
            }}
          >
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderWidth: 1,
    alignItems: 'center',
    gap: 15,
    padding: 30,
    maxWidth: 420,
    width: '100%',
  },
  button: {
    borderWidth: 1,
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 20,
    marginTop: 4,
  },
});
