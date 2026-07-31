// The holding screen shown in place of the entire app while
// MAINTENANCE_MODE is on (see ./config and app/_layout.tsx).
//
// It renders inside ThemeProvider — so it gets the real palette and the
// bundled faces — but ABOVE SessionProvider and the router, which is the
// point: nothing here mounts Supabase, react-query or a single route, so a
// visitor cannot reach a screen mid-migration and no request goes out while
// the backend is being worked on.
//
// Deliberately self-contained (no <Screen>, no expo-router imports): the
// marquee is centred in the window rather than laid out on the app's
// phone-shaped canvas, and this must keep rendering even if a router or
// data-layer change is exactly what is being deployed.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function MaintenanceScreen() {
  const { colors, fonts, fs } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.ink2, fontFamily: fonts.mono, fontSize: fs(9.5) }]}>
          Closed for the evening
        </Text>

        <Text
          style={[
            styles.marquee,
            { color: colors.brass, fontFamily: fonts.display, fontSize: fs(30) },
          ]}
        >
          Comp Matcher
        </Text>

        <View style={[styles.rule, { backgroundColor: colors.cardLine }]} />

        <Text style={[styles.headline, { color: colors.ink, fontFamily: fonts.serif, fontSize: fs(26) }]}>
          The floor is being polished
        </Text>

        <Text style={[styles.body, { color: colors.ink2, fontFamily: fonts.body, fontSize: fs(16) }]}>
          We&apos;re down for scheduled maintenance while we make a few improvements. Your
          profile, matches and messages are all safe — nothing has been lost.
        </Text>

        <Text style={[styles.body, { color: colors.ink2, fontFamily: fonts.body, fontSize: fs(16) }]}>
          Come back shortly and the music will be playing again.
        </Text>

        <View style={[styles.rule, { backgroundColor: colors.line }]} />

        <Text style={[styles.footnote, { color: colors.ink2, fontFamily: fonts.mono, fontSize: fs(9.5) }]}>
          Scheduled maintenance &middot; Thank you for your patience
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
  },
  eyebrow: {
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  marquee: {
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 14,
  },
  rule: {
    height: 1,
    width: 96,
    marginVertical: 28,
  },
  headline: {
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  footnote: {
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
