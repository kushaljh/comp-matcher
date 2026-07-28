// Where an emailed recovery link lands. By the time this renders, the recovery
// token has already been exchanged for a session — on web by supabase-js's
// `detectSessionInUrl`, on native by SessionProvider's deep-link handler — and
// AuthGate has routed here because `recovering` is set.
//
// So this screen's only job is to take a new password and save it. It never
// touches the token itself.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { updatePassword } from '../../features/auth/api';
import { useSession } from '../../features/auth/SessionProvider';
import { Button, Screen, TextField } from '../../theme/components';
import { useTheme } from '../../theme/ThemeProvider';

const MIN_LENGTH = 8;

export default function ResetPasswordScreen() {
  const { colors, fonts, fs } = useTheme();
  const { endRecovery } = useSession();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN_LENGTH && password === confirm && !loading;

  async function handleSave() {
    setError(null);
    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // Clearing the flag is what releases AuthGate to route normally again —
    // into onboarding or the tabs depending on whether a profile exists.
    endRecovery();
    router.replace('/(tabs)/swipe');
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(26),
            letterSpacing: 1,
            color: colors.ink,
            marginBottom: 6,
          }}
        >
          Set a new password
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginBottom: 18 }}>
          Pick something at least {MIN_LENGTH} characters long.
        </Text>

        <TextField
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <TextField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />

        {tooShort || mismatch || error ? (
          <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(13), marginBottom: 8 }}>
            {error ??
              (mismatch ? "Those two passwords don't match." : `Use at least ${MIN_LENGTH} characters.`)}
          </Text>
        ) : null}

        <Button title="Save password" onPress={handleSave} loading={loading} disabled={!canSubmit} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 32, gap: 8 },
});
