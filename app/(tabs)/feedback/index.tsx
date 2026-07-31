// Feedback — tell the admins something.
//
// A top-level tab rather than a corner of Settings: while the floor is mostly
// test users, the whole point is that reporting something is one tap away.
// Settings keeps a row pointing here for people who look where sign-out and
// invites live.
//
// Fire and forget by design — a sent note is not readable by its author (see
// the migration's header), so there is no history list here, just the form and
// a confirmation.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSubmitFeedback } from '../../../features/feedback/hooks';
import type { Enums } from '../../../lib/database.types';

type Category = Enums<'feedback_category'>;

const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'Bug', value: 'bug' },
  { label: 'Idea', value: 'idea' },
  { label: 'Other', value: 'other' },
];

type FormErrors = Partial<Record<'message' | 'submit', string>>;

// Same pill as Settings' appearance/text-size rows — this screen is the
// user-facing side of the app, so it uses the themed useTheme() era throughout.
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

export default function FeedbackScreen() {
  const router = useRouter();
  const { colors, fonts, fs } = useTheme();
  const submitFeedback = useSubmitFeedback();

  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!message.trim()) next.message = 'Required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    try {
      await submitFeedback.mutateAsync({ category, message: message.trim() });
      setSubmitted(true);
    } catch (err: any) {
      setErrors({ submit: err?.message ?? 'Could not send your feedback.' });
    }
  }

  // Clearing `submitted` on the way out matters here in a way it doesn't for
  // events/suggest.tsx: this is a TAB, so the screen stays mounted. Without the
  // reset, coming back to the tab later would show a stale thank-you instead of
  // a fresh form.
  function handleDone() {
    setCategory('bug');
    setMessage('');
    setErrors({});
    setSubmitted(false);
    router.navigate('/swipe');
  }

  if (submitted) {
    return (
      <Screen style={styles.confirmScreen}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(22),
            letterSpacing: 1,
            color: colors.ink,
            marginBottom: 10,
            textAlign: 'center',
          }}
        >
          Thanks — the admins have it.
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: fs(14),
            lineHeight: fs(21),
            color: colors.ink2,
            marginBottom: 22,
            textAlign: 'center',
          }}
        >
          We read every note. You won&apos;t get a reply in the app, so leave your email in the
          message if you want one.
        </Text>
        <Button title="Back to the floor" onPress={handleDone} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text
            style={{ fontFamily: fonts.display, fontSize: fs(25), letterSpacing: 1.2, color: colors.ink }}
          >
            Feedback
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 6 }}>
            Something broken, or something the app should do? Tell us.
          </Text>
          <View style={styles.deco}>
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
            <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
            <View style={[styles.diamond, { borderWidth: 1, borderColor: colors.cardLine }]} />
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={[styles.microLabel, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}
          >
            What kind of note is this?
          </Text>
          <View style={styles.pillRow}>
            {CATEGORIES.map((option) => (
              <Pill
                key={option.value}
                label={option.label}
                active={category === option.value}
                onPress={() => setCategory(option.value)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Your note"
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
          }}
          error={errors.message}
          placeholder="What happened, or what you'd like to see…"
          multiline
          numberOfLines={6}
          style={styles.messageInput}
        />

        {errors.submit ? (
          <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(14), marginBottom: 16 }}>
            {errors.submit}
          </Text>
        ) : null}

        <Button title="Send" onPress={handleSubmit} loading={submitFeedback.isPending} />
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
  },
  confirmScreen: {
    justifyContent: 'center',
  },
  section: {
    gap: 10,
    marginTop: 24,
    marginBottom: 20,
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
  messageInput: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
});
