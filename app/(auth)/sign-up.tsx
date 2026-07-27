import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { signUpWithEmail } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

export default function SignUpScreen() {
  const { colors, fonts, fs } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp() {
    setError(null);
    setLoading(true);
    const { data, error: signUpError } = await signUpWithEmail(email.trim(), password);
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      // "Confirm email" is on for this project: signUp succeeds but issues
      // no session until the user clicks the emailed confirmation link.
      setConfirmationSent(true);
      return;
    }
    // A session came back immediately (confirmation disabled for this
    // project) — AuthGate reacts to the auth-state-change event and routes
    // straight to onboarding.
  }

  if (confirmationSent) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontFamily: fonts.display, fontSize: fs(24), letterSpacing: 1, color: colors.ink, marginBottom: 16, textAlign: 'center' }}>
          Check your email
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(15), color: colors.ink2, textAlign: 'center' }}>
          We sent a confirmation link to {email.trim()}. Confirm your address, then come back and
          sign in.
        </Text>
        <Link href="/(auth)/sign-in" style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}>
          Back to sign in
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(28),
            letterSpacing: 1,
            color: colors.ink,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          Create an account
        </Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        {error ? (
          <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(13), marginBottom: 8 }}>
            {error}
          </Text>
        ) : null}
        <Button
          title="Sign up"
          onPress={handleSignUp}
          loading={loading}
          disabled={!email.trim() || !password}
        />
        <Link href="/(auth)/sign-in" style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}>
          Already have an account? Sign in
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 32, gap: 8 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  link: {
    textAlign: 'center',
    marginTop: 16,
  },
});
