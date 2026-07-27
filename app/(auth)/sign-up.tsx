import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { signUpWithEmail } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';

export default function SignUpScreen() {
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
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          We sent a confirmation link to {email.trim()}. Confirm your address, then come back and
          sign in.
        </Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          Back to sign in
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Create an account</Text>
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title="Sign up"
          onPress={handleSignUp}
          loading={loading}
          disabled={!email.trim() || !password}
        />
        <Link href="/(auth)/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xl, gap: spacing.sm },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  body: { fontSize: fontSizes.md, color: colors.textSecondary, textAlign: 'center' },
  error: { color: colors.red, marginBottom: spacing.sm },
  link: {
    color: colors.brass,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
