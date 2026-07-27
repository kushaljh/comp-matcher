import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Screen, TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { useSuggestEvent } from '../../../features/events/hooks';
import { isPlausibleUrl, isValidDateString } from '../../../features/events/format';

type FormErrors = Partial<
  Record<'name' | 'location' | 'startDate' | 'endDate' | 'website' | 'facebook' | 'submit', string>
>;

export default function SuggestEventScreen() {
  const router = useRouter();
  const suggestMutation = useSuggestEvent();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!name.trim()) next.name = 'Required';
    if (!location.trim()) next.location = 'Required';
    if (!isValidDateString(startDate)) next.startDate = 'Use format YYYY-MM-DD';
    if (!isValidDateString(endDate)) next.endDate = 'Use format YYYY-MM-DD';
    if (!next.startDate && !next.endDate && endDate < startDate) {
      next.endDate = 'End date must be on or after the start date';
    }
    if (website.trim() && !isPlausibleUrl(website.trim())) {
      next.website = 'Must start with http:// or https://';
    }
    if (facebook.trim() && !isPlausibleUrl(facebook.trim())) {
      next.facebook = 'Must start with http:// or https://';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    try {
      await suggestMutation.mutateAsync({
        name: name.trim(),
        location: location.trim(),
        start_date: startDate,
        end_date: endDate,
        website_url: website.trim() || null,
        facebook_url: facebook.trim() || null,
      });
      setSubmitted(true);
    } catch (err: any) {
      setErrors({ submit: err?.message ?? 'Could not submit this event.' });
    }
  }

  if (submitted) {
    return (
      <Screen style={styles.confirmScreen}>
        <Card>
          <Text style={styles.confirmText}>Submitted — it'll appear once approved.</Text>
          <Button title="Back to events" onPress={() => router.replace('/events')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Suggest an event</Text>

        <TextField label="Name" value={name} onChangeText={setName} error={errors.name} />
        <TextField label="Location" value={location} onChangeText={setLocation} error={errors.location} />
        <TextField
          label="Start date (YYYY-MM-DD)"
          value={startDate}
          onChangeText={setStartDate}
          error={errors.startDate}
          placeholder="2026-08-28"
          autoCapitalize="none"
        />
        <TextField
          label="End date (YYYY-MM-DD)"
          value={endDate}
          onChangeText={setEndDate}
          error={errors.endDate}
          placeholder="2026-09-01"
          autoCapitalize="none"
        />
        <TextField
          label="Website (optional)"
          value={website}
          onChangeText={setWebsite}
          error={errors.website}
          placeholder="https://…"
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextField
          label="Facebook (optional)"
          value={facebook}
          onChangeText={setFacebook}
          error={errors.facebook}
          placeholder="https://facebook.com/…"
          autoCapitalize="none"
          keyboardType="url"
        />

        {errors.submit ? <Text style={styles.errorText}>{errors.submit}</Text> : null}

        <Button title="Submit" onPress={handleSubmit} loading={suggestMutation.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  back: {
    fontSize: fontSizes.md,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.sm,
    marginBottom: spacing.md,
  },
  confirmScreen: {
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});
