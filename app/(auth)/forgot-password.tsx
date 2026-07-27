import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { requestPasswordReset } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    setError(null);
    setLoading(true);
    const { error: resetError } = await requestPasswordReset(email.trim());
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Reset your password</Text>
        {sent ? (
          <Text style={styles.body}>
            If an account exists for {email.trim()}, a reset link is on its way. MVP note:
            finishing the reset from that emailed link isn&apos;t wired up inside this app yet —
            that&apos;s planned post-MVP.
          </Text>
        ) : (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title="Send reset link"
              onPress={handleReset}
              loading={loading}
              disabled={!email.trim()}
            />
          </>
        )}
        <Link href="/(auth)/sign-in" style={styles.link}>
          Back to sign in
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
  body: { fontSize: fontSizes.md, color: colors.textSecondary },
  error: { color: colors.red, marginBottom: spacing.sm },
  link: {
    color: colors.brass,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
