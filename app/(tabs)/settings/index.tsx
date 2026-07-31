// Settings — the house rules for how the app looks and behaves.
//
// Appearance / text size / motion write straight through to ThemeProvider (and
// from there to AsyncStorage), so every choice is live and survives a reload.
// The account block duplicates sign-out / delete-account from Your Card on
// purpose: this is where people look for them. The design's email-OTP delete
// flow is deferred — this keeps the existing confirm + delete_my_account RPC.

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../theme/components';
import { TEXT_SCALES, useTheme, type ThemeMode } from '../../../theme/ThemeProvider';
import { useSession } from '../../../features/auth/SessionProvider';
import { InvitesSection } from '../../../features/invites/InvitesSection';
import { confirmAsync } from '../../../features/profile/confirm';
import { useDeleteAccount, useSignOut } from '../../../features/profile/hooks';

const MODE_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

const SCALE_LABELS = ['Small', 'Default', 'Large', 'Larger'];

function SectionLabel({ children }: { children: string }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <Text style={[styles.microLabel, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
      {children}
    </Text>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, fonts, fs, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.pill,
        { borderRadius: radii.pill, backgroundColor: active ? colors.brass : 'transparent' },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.condensedSemi,
          fontSize: fs(12.5),
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: active ? colors.bg : colors.ink2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Hint({ children }: { children: string }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <Text style={{ fontFamily: fonts.body, fontSize: fs(13), lineHeight: fs(20), color: colors.ink2 }}>
      {children}
    </Text>
  );
}

export default function SettingsScreen() {
  const {
    colors,
    fonts,
    fs,
    radii,
    mode,
    resolvedMode,
    setMode,
    textScale,
    setTextScale,
    reduceMotion,
    setReduceMotion,
  } = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  const email = session?.user.email ?? '—';

  const handleSignOut = async () => {
    const confirmed = await confirmAsync('Sign out?', 'You can sign back in any time.', 'Sign out');
    if (confirmed) signOut.mutate();
  };

  const handleDelete = async () => {
    const confirmed = await confirmAsync(
      'Delete your account?',
      'This permanently deletes your profile, photo, contacts, competition history, entries, and matches. This cannot be undone.',
      'Delete account'
    );
    if (confirmed) deleteAccount.mutate();
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={{ fontFamily: fonts.display, fontSize: fs(25), letterSpacing: 1.2, color: colors.ink }}>
            Settings
          </Text>
          <Text
            style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 6 }}
          >
            How the house looks and behaves for you.
          </Text>
          <View style={styles.deco}>
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
            <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
            <View style={[styles.diamond, { borderWidth: 1, borderColor: colors.cardLine }]} />
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Appearance</SectionLabel>
          <View style={styles.pillRow}>
            {MODE_OPTIONS.map((option) => (
              <Pill
                key={option.value}
                label={option.label}
                active={mode === option.value}
                onPress={() => setMode(option.value)}
              />
            ))}
          </View>
          <Hint>{`System follows your device — currently ${mode === 'system' ? `system · ${resolvedMode}` : resolvedMode}.`}</Hint>
        </View>

        <View style={styles.section}>
          <SectionLabel>Text size</SectionLabel>
          <View style={styles.pillRow}>
            {TEXT_SCALES.map((scale, i) => (
              <Pill
                key={scale}
                label={SCALE_LABELS[i]}
                active={Math.abs(textScale - scale) < 0.001}
                onPress={() => setTextScale(scale)}
              />
            ))}
          </View>
          <View style={[styles.well, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
            <Text style={{ fontFamily: fonts.serif, fontSize: fs(21), color: colors.ink }}>
              Marguerite Vail
            </Text>
            <Text
              style={{
                fontFamily: fonts.condensed,
                fontSize: fs(12.5),
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: colors.ink2,
                marginTop: 4,
              }}
            >
              Follower · novice · sample card text
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Motion</SectionLabel>
          <View style={styles.pillRow}>
            <Pill label="Full motion" active={!reduceMotion} onPress={() => setReduceMotion(false)} />
            <Pill label="Reduce motion" active={reduceMotion} onPress={() => setReduceMotion(true)} />
          </View>
          <Hint>Reduce motion stills card animations and celebration effects. Swiping still works.</Hint>
        </View>

        <View style={styles.section}>
          <SectionLabel>Invites</SectionLabel>
          <InvitesSection />
          <Hint>
            Comp Matcher is invite only. Share a code with a dancer you&apos;d vouch for — each one
            works once.
          </Hint>
        </View>

        <View style={styles.section}>
          <SectionLabel>Feedback</SectionLabel>
          <View style={[styles.block, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
            <Pressable
              onPress={() => router.navigate('/feedback')}
              accessibilityRole="link"
              style={styles.row}
            >
              <Text style={{ fontFamily: fonts.body, fontSize: fs(14.5), color: colors.ink }}>
                Send feedback
              </Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: fs(12), color: colors.brass }}>→</Text>
            </Pressable>
          </View>
          <Hint>
            Found a bug, or thought of something the app should do? The Feedback tab goes straight to
            the admins.
          </Hint>
        </View>

        <View style={styles.section}>
          <SectionLabel>Account</SectionLabel>
          <View style={[styles.block, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
            <View style={styles.row}>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(14.5), color: colors.ink }}>
                Signed in as
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.mono, fontSize: fs(12), color: colors.ink2, flexShrink: 1 }}
              >
                {email}
              </Text>
            </View>
            <Pressable
              onPress={handleSignOut}
              disabled={signOut.isPending}
              accessibilityRole="button"
              style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line }]}
            >
              <Text style={{ fontFamily: fonts.body, fontSize: fs(14.5), color: colors.ink }}>
                {signOut.isPending ? 'Signing out…' : 'Sign out'}
              </Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: fs(12), color: colors.brass }}>→</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Danger zone</SectionLabel>
          <View style={[styles.danger, { borderColor: colors.red, borderRadius: radii.rSm }]}>
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(14),
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: colors.red,
              }}
            >
              Delete account
            </Text>
            <Hint>
              Withdraws you from every contest, removes your card from every floor, and deletes your
              pairings from your partners&apos; dance cards. Contact details already exchanged stay with
              them. This cannot be undone.
            </Hint>
            <Pressable
              onPress={handleDelete}
              disabled={deleteAccount.isPending}
              accessibilityRole="button"
              style={[
                styles.dangerButton,
                { borderColor: colors.red, borderRadius: radii.pill, opacity: deleteAccount.isPending ? 0.5 : 1 },
              ]}
            >
              <Text
                style={{
                  fontFamily: fonts.condensedSemi,
                  fontSize: fs(12.5),
                  letterSpacing: 1.8,
                  textTransform: 'uppercase',
                  color: colors.red,
                }}
              >
                {deleteAccount.isPending ? 'Deleting…' : 'Delete my account'}
              </Text>
            </Pressable>
            {deleteAccount.isError ? (
              <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.red }}>
                {deleteAccount.error instanceof Error
                  ? deleteAccount.error.message
                  : 'Could not delete your account.'}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  microLabel: {
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  deco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13,
    width: 220,
  },
  decoRule: {
    flex: 1,
    height: 1,
  },
  diamond: {
    width: 6,
    height: 6,
    transform: [{ rotate: '45deg' }],
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 15,
  },
  well: {
    padding: 16,
  },
  block: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 17,
  },
  danger: {
    borderWidth: 1,
    padding: 17,
    gap: 12,
  },
  dangerButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
});
