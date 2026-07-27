import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { signInWithEmail } from '../../features/auth/api';
import { Button, Screen, TextField } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

export default function SignInScreen() {
  const { colors, fonts, fs } = useTheme();
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
        <Text style={{ fontFamily: fonts.display, fontSize: fs(28), letterSpacing: 1, color: colors.ink, marginBottom: 24 }}>
          Welcome back
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
          title="Sign in"
          onPress={handleSignIn}
          loading={loading}
          disabled={!email.trim() || !password}
        />
        <Link href="/(auth)/forgot-password" style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}>
          Forgot password?
        </Link>
        <Link href="/(auth)/sign-up" style={[styles.link, { color: colors.brass, fontFamily: fonts.body, fontSize: fs(14) }]}>
          Don&apos;t have an account? Sign up
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
