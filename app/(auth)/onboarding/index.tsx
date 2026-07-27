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
import type { ContactPlatform, DanceRole } from '../../../features/auth/api';
import { submitOnboarding } from '../../../features/auth/api';
import { CONTACT_PLATFORMS, DANCE_ROLES, PLATFORM_LABELS, VALUES } from '../../../features/auth/constants';
import { useSession } from '../../../features/auth/SessionProvider';
import { hasProfileQueryKey } from '../../../features/auth/useHasProfile';
import { Button, Card, Screen, TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';

type ContactDraft = { platform: ContactPlatform; handle: string };
type HistoryDraft = { event_name: string; year: string; contest_name: string; placement: string };

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<DanceRole | null>(null);
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

  const missing: string[] = [];
  if (!photoUri) missing.push('a profile photo');
  if (!displayName.trim()) missing.push('a display name');
  if (!role) missing.push('your role');
  if (filledContacts.length === 0) missing.push('at least one contact');

  const canSubmit = missing.length === 0 && !submitting;

  async function handleSubmit() {
    if (!session || !photoUri || !role) return;
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
        role,
        values: selectedValues,
        bio: bio.trim() ? bio.trim() : null,
        contacts: filledContacts.map((c) => ({ platform: c.platform, handle: c.handle.trim() })),
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

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Set up your profile</Text>

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Photo</Text>
          <View style={styles.photoRow}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderText}>No photo</Text>
              </View>
            )}
            <Button title={photoUri ? 'Change photo' : 'Choose photo'} variant="secondary" onPress={handlePickPhoto} />
          </View>
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}
        </Card>

        <Card style={styles.card}>
          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />

          <Text style={styles.sectionLabel}>Role</Text>
          <View style={styles.chipRow}>
            {DANCE_ROLES.map((r) => (
              <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
            ))}
          </View>
          <Text style={styles.caption}>
            Your role is fixed once set — you can&apos;t switch between leader and follower later.
          </Text>

          <Text style={styles.sectionLabel}>Values</Text>
          <View style={styles.chipRow}>
            {VALUES.map((v) => (
              <Chip key={v} label={v} selected={selectedValues.includes(v)} onPress={() => toggleValue(v)} />
            ))}
          </View>

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
          <Text style={styles.sectionLabel}>Contacts (at least one required)</Text>
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
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          <Pressable onPress={addContact}>
            <Text style={styles.addText}>+ Add another contact</Text>
          </Pressable>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Competition history (optional)</Text>
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
                <Text style={styles.removeText}>Remove this entry</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addHistory}>
            <Text style={styles.addText}>+ Add a competition</Text>
          </Pressable>
        </Card>

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
        <Button title="Finish" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        {missing.length > 0 ? (
          <Text style={styles.caption}>Still need: {missing.join(', ')}.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xl, gap: spacing.md },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  card: { gap: spacing.sm },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  error: { color: colors.red, fontSize: fontSizes.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoPreview: { width: 72, height: 72, borderRadius: radii.pill },
  photoPlaceholder: {
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: fontSizes.xs, color: colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.brass, borderColor: colors.brass },
  chipText: { fontSize: fontSizes.sm, color: colors.textPrimary },
  chipTextSelected: { color: colors.navy, fontWeight: fontWeights.semibold },
  bioInput: { minHeight: 72, textAlignVertical: 'top' },
  row: { gap: spacing.xs, marginBottom: spacing.sm },
  rowFields: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexInput: { flex: 1 },
  addText: { color: colors.brass, fontWeight: fontWeights.semibold, fontSize: fontSizes.sm },
  removeText: { color: colors.red, fontSize: fontSizes.sm },
});
