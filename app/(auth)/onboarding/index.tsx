// Onboarding wizard: single scrollable form (not a multi-step flow — nothing
// here has a hard ordering dependency, so paging would only add navigation
// state for no benefit).
//
// Blocks submission until photo + display_name + role + >=1 contact are
// present (see `missing` below, which also drives the on-screen hint).

import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ContactPlatform } from '../../../features/auth/api';
import { submitOnboarding } from '../../../features/auth/api';
import { CONTACT_PLATFORMS, PLATFORM_LABELS } from '../../../features/auth/constants';
import { validateContact } from '../../../features/profile/contactValidation';
import { ValuesField } from '../../../features/auth/ValuesField';
import { useSession } from '../../../features/auth/SessionProvider';
import { hasProfileQueryKey } from '../../../features/auth/useHasProfile';
import { Button, Card, Screen, TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { radii, spacing } from '../../../theme/tokens';

type ContactDraft = { platform: ContactPlatform; handle: string };
type HistoryDraft = { event_name: string; year: string; contest_name: string; placement: string };

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderRadius: radii.pill,
          borderColor: selected ? colors.brass : colors.line,
          backgroundColor: selected ? colors.brass : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          fontFamily: selected ? fonts.condensedSemi : fonts.condensed,
          fontSize: fs(13),
          textTransform: 'capitalize',
          color: selected ? colors.bg : colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const { colors, fonts, fs } = useTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [bio, setBio] = useState('');

  const [contacts, setContacts] = useState<ContactDraft[]>([{ platform: 'instagram', handle: '' }]);
  const [history, setHistory] = useState<HistoryDraft[]>([]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePickPhoto() {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo library permission is required to choose a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  function toggleValue(value: string) {
    setSelectedValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function updateContact(index: number, patch: Partial<ContactDraft>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function addContact() {
    setContacts((prev) => [...prev, { platform: 'instagram', handle: '' }]);
  }
  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateHistory(index: number, patch: Partial<HistoryDraft>) {
    setHistory((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }
  function addHistory() {
    setHistory((prev) => [...prev, { event_name: '', year: '', contest_name: '', placement: '' }]);
  }
  function removeHistory(index: number) {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }

  const filledContacts = contacts.filter((c) => c.handle.trim().length > 0);

  // Validate each filled row so the message appears under the field the user is
  // typing in, rather than as one submit-time error naming none of them.
  const contactErrors = contacts.map((c) => {
    if (!c.handle.trim()) return null;
    const result = validateContact(c.platform, c.handle);
    return result.ok ? null : result.error;
  });
  const hasContactError = contactErrors.some(Boolean);

  const missing: string[] = [];
  if (!photoUri) missing.push('a profile photo');
  if (!displayName.trim()) missing.push('a display name');
  if (filledContacts.length === 0) missing.push('at least one contact');

  const canSubmit = missing.length === 0 && !hasContactError && !submitting;

  async function handleSubmit() {
    if (!session || !photoUri) return;
    setSubmitError(null);

    // A history row the user started filling must be complete (or emptied) —
    // silently dropping it would lose data they typed. Fully blank rows are
    // ignored. Year is required: the same events run every year.
    const partialRow = history.find((h) => {
      const touched =
        h.event_name.trim() || h.contest_name.trim() || h.year.trim() || h.placement.trim();
      if (!touched) return false;
      const year = Number.parseInt(h.year, 10);
      return (
        !h.event_name.trim() ||
        !h.contest_name.trim() ||
        !Number.isFinite(year) ||
        year < 1900
      );
    });
    if (partialRow) {
      setSubmitError(
        'One of your competition-history rows is incomplete — event, contest, and a valid year are all required (or clear the row).'
      );
      return;
    }

    setSubmitting(true);
    try {
      const filledHistory = history
        .map((h) => {
          const eventName = h.event_name.trim();
          const contestName = h.contest_name.trim();
          const year = Number.parseInt(h.year, 10);
          if (!eventName || !contestName || !Number.isFinite(year)) return null;
          return {
            event_name: eventName,
            contest_name: contestName,
            year,
            placement: h.placement.trim() ? h.placement.trim() : null,
          };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null);

      await submitOnboarding({
        userId: session.user.id,
        photoUri,
        displayName: displayName.trim(),
        values: selectedValues,
        bio: bio.trim() ? bio.trim() : null,
        // Store the canonical form, not the raw text — the submit button is
        // already disabled while any row is invalid, so these all validate.
        contacts: filledContacts.map((c) => {
          const result = validateContact(c.platform, c.handle);
          return { platform: c.platform, handle: result.ok ? result.value : c.handle.trim() };
        }),
        history: filledHistory,
      });

      // Update the cache synchronously so AuthGate's next check (right after
      // this navigation) sees hasProfile=true instead of a stale cached
      // `false`, which would otherwise bounce us straight back here.
      queryClient.setQueryData(hasProfileQueryKey(session.user.id), true);
      router.replace('/(tabs)/swipe');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const sectionLabel = { fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.ink };
  const caption = { fontFamily: fonts.body, fontSize: fs(12), color: colors.ink2 };
  const errorText = { fontFamily: fonts.body, fontSize: fs(13), color: colors.red };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={{ fontFamily: fonts.display, fontSize: fs(26), letterSpacing: 1, color: colors.ink }}>
          Set up your profile
        </Text>

        <Card style={styles.card}>
          <Text style={sectionLabel}>Photo</Text>
          <View style={styles.photoRow}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={[styles.photoPreview, styles.photoPlaceholder, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                <Text style={{ fontFamily: fonts.body, fontSize: fs(12), color: colors.ink2 }}>No photo</Text>
              </View>
            )}
            <Button title={photoUri ? 'Change photo' : 'Choose photo'} variant="secondary" onPress={handlePickPhoto} />
          </View>
          {photoError ? <Text style={errorText}>{photoError}</Text> : null}
        </Card>

        <Card style={styles.card}>
          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />

          <Text style={caption}>
            You pick lead or follow when you enter each contest — not here. You can dance
            either, and both in the same contest.
          </Text>

          <Text style={sectionLabel}>Values (optional)</Text>
          <ValuesField values={selectedValues} onChange={setSelectedValues} />

          <TextField
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
            style={styles.bioInput}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={sectionLabel}>Contacts (at least one required)</Text>
          {contacts.map((contact, index) => (
            <View key={index} style={styles.row}>
              <View style={styles.chipRow}>
                {CONTACT_PLATFORMS.map((p) => (
                  <Chip
                    key={p}
                    label={PLATFORM_LABELS[p]}
                    selected={contact.platform === p}
                    onPress={() => updateContact(index, { platform: p })}
                  />
                ))}
              </View>
              <View style={styles.rowFields}>
                <TextField
                  value={contact.handle}
                  onChangeText={(handle) => updateContact(index, { handle })}
                  placeholder="Handle, number, or address"
                  style={styles.flexInput}
                  autoCapitalize="none"
                />
                {contacts.length > 1 ? (
                  <Pressable onPress={() => removeContact(index)}>
                    <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.red }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              {contactErrors[index] ? (
                <Text style={errorText}>{contactErrors[index]}</Text>
              ) : null}
            </View>
          ))}
          <Pressable onPress={addContact}>
            <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.brass }}>
              + Add another contact
            </Text>
          </Pressable>
        </Card>

        <Card style={styles.card}>
          <Text style={sectionLabel}>Competition history (optional)</Text>
          {history.map((row, index) => (
            <View key={index} style={styles.row}>
              <TextField
                label="Event name"
                value={row.event_name}
                onChangeText={(v) => updateHistory(index, { event_name: v })}
              />
              <TextField
                label="Year"
                value={row.year}
                onChangeText={(v) => updateHistory(index, { year: v })}
                keyboardType="numeric"
              />
              <TextField
                label="Contest name"
                value={row.contest_name}
                onChangeText={(v) => updateHistory(index, { contest_name: v })}
              />
              <TextField
                label="Placement (optional)"
                value={row.placement}
                onChangeText={(v) => updateHistory(index, { placement: v })}
              />
              <Pressable onPress={() => removeHistory(index)}>
                <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.red }}>
                  Remove this entry
                </Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addHistory}>
            <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.brass }}>
              + Add a competition
            </Text>
          </Pressable>
        </Card>

        {submitError ? <Text style={errorText}>{submitError}</Text> : null}
        <Button title="Finish" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        {missing.length > 0 ? <Text style={caption}>Still need: {missing.join(', ')}.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xl, gap: spacing.md },
  card: { gap: spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoPreview: { width: 72, height: 72, borderRadius: radii.pill },
  photoPlaceholder: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  bioInput: { minHeight: 72, textAlignVertical: 'top' },
  row: { gap: spacing.xs, marginBottom: spacing.sm },
  rowFields: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexInput: { flex: 1 },
});
