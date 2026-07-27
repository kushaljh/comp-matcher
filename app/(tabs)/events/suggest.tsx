import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Screen, TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSuggestEvent } from '../../../features/events/hooks';
import { DateRangePicker } from '../../../features/events/DateRangePicker';
import { formatDateRange, isPlausibleUrl } from '../../../features/events/format';

type FormErrors = Partial<
  Record<'name' | 'location' | 'dates' | 'website' | 'facebook' | 'submit', string>
>;

export default function SuggestEventScreen() {
  const router = useRouter();
  const { colors, fonts, fs } = useTheme();
  const suggestMutation = useSuggestEvent();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!name.trim()) next.name = 'Required';
    if (!location.trim()) next.location = 'Required';
    if (!startDate || !endDate) next.dates = 'Pick the event dates on the calendar';
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
        start_date: startDate!,
        end_date: endDate!,
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
        <Text style={{ fontFamily: fonts.body, fontSize: fs(16), color: colors.ink, marginBottom: 16 }}>
          Submitted — it&apos;ll appear once approved.
        </Text>
        <Button title="Back to events" onPress={() => router.replace('/events')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(13),
              letterSpacing: 1,
              color: colors.brass,
              marginBottom: 8,
            }}
          >
            ← Back
          </Text>
        </Pressable>
        <Text
          style={{ fontFamily: fonts.display, fontSize: fs(22), letterSpacing: 1, color: colors.ink, marginBottom: 16 }}
        >
          Suggest an event
        </Text>

        <TextField label="Name" value={name} onChangeText={setName} error={errors.name} />
        <TextField label="Location" value={location} onChangeText={setLocation} error={errors.location} />
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(range) => {
            setStartDate(range.startDate);
            setEndDate(range.endDate);
            if (errors.dates) setErrors((prev) => ({ ...prev, dates: undefined }));
          }}
          error={errors.dates}
        />
        {startDate && endDate ? (
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(13),
              color: colors.brass,
              marginTop: -8,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {formatDateRange(startDate, endDate)}
          </Text>
        ) : null}
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

        {errors.submit ? (
          <Text style={{ color: colors.red, fontFamily: fonts.body, fontSize: fs(14), marginBottom: 16 }}>
            {errors.submit}
          </Text>
        ) : null}

        <Button title="Submit" onPress={handleSubmit} loading={suggestMutation.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  confirmScreen: {
    justifyContent: 'center',
  },
});
