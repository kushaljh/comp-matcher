import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { signInWithEmail } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    // Success falls through with no navigation call: SessionProvider's
    // onAuthStateChange listener picks up the new session and AuthGate
    // (app/_layout.tsx) redirects to onboarding or the tabs.
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Welcome back</Text>
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
          title="Sign in"
          onPress={handleSignIn}
          loading={loading}
          disabled={!email.trim() || !password}
        />
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
        <Link href="/(auth)/sign-up" style={styles.link}>
          Don&apos;t have an account? Sign up
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xl, gap: spacing.sm },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  error: { color: colors.red, marginBottom: spacing.sm },
  link: {
    color: colors.brass,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
