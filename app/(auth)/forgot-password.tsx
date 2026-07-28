import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { requestPasswordReset } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

export default function ForgotPasswordScreen() {
  const { colors, fonts, fs } = useTheme();
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
        <Text style={{ fontFamily: fonts.display, fontSize: fs(26), letterSpacing: 1, color: colors.ink, marginBottom: 24 }}>
          Reset your password
        </Text>
        {sent ? (
          <Text style={{ fontFamily: fonts.body, fontSize: fs(15), color: colors.ink2 }}>
            If an account exists for {email.trim()}, a reset link is on its way. Open it on this
            device and you&apos;ll land straight on a screen to choose a new password.
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
            {error ? (
              <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(13), marginBottom: 8 }}>
                {error}
              </Text>
            ) : null}
            <Button title="Send reset link" onPress={handleReset} loading={loading} disabled={!email.trim()} />
          </>
        )}
        <Link href="/(auth)/sign-in" style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}>
          Back to sign in
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 32, gap: 8 },
  link: {
    textAlign: 'center',
    marginTop: 16,
  },
});
