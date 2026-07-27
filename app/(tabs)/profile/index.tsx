import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';
import { useIsAdmin } from '../../../features/admin/hooks';
import { ContactsSection } from '../../../features/profile/components/ContactsSection';
import { EntriesSection } from '../../../features/profile/components/EntriesSection';
import { HistorySection } from '../../../features/profile/components/HistorySection';
import { ValuesEditor } from '../../../features/profile/components/ValuesEditor';
import { confirmAsync } from '../../../features/profile/confirm';
import {
  useCurrentUserId,
  useDeleteAccount,
  useMyProfile,
  useSignOut,
  useUpdateProfile,
  useUploadPhoto,
} from '../../../features/profile/hooks';

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  follower: 'Follower',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { data: profile, profileId, isLoading, isError, error } = useMyProfile();
  const { data: userId } = useCurrentUserId();
  const { data: isAdmin } = useIsAdmin();

  const updateProfile = useUpdateProfile(profileId);
  const uploadPhoto = useUploadPhoto(profileId, userId ?? undefined);
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  const [initialized, setInitialized] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    if (profile && !initialized) {
      setDisplayName(profile.display_name);
      setBio(profile.bio ?? '');
      setValues(profile.values);
      setInitialized(true);
    }
  }, [profile, initialized]);

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Could not load your profile.'}
        </Text>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>Complete your profile setup to continue.</Text>
      </Screen>
    );
  }

  const isDirty =
    displayName !== profile.display_name ||
    bio !== (profile.bio ?? '') ||
    JSON.stringify(values) !== JSON.stringify(profile.values);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;

    uploadPhoto.mutate(result.assets[0].uri);
  };

  const handleSave = () => {
    updateProfile.mutate({
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      values,
    });
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAsync('Sign out?', 'You can sign back in any time.', 'Sign out');
    if (confirmed) signOut.mutate();
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirmAsync(
      'Delete your account?',
      'This permanently deletes your profile, photo, contacts, competition history, entries, and matches. This cannot be undone.',
      'Delete account'
    );
    if (confirmed) deleteAccount.mutate();
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.section}>
          <View style={styles.photoRow}>
            <Pressable onPress={pickPhoto} disabled={uploadPhoto.isPending}>
              {profile.photo_url ? (
                <Image source={{ uri: profile.photo_url }} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Text style={styles.photoPlaceholderText}>
                    {profile.display_name.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              {uploadPhoto.isPending && (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}
            </Pressable>
            <View style={styles.photoText}>
              <Pressable onPress={pickPhoto} disabled={uploadPhoto.isPending}>
                <Text style={styles.changePhoto}>Change photo</Text>
              </Pressable>
              <Text style={styles.roleText}>
                Role: {ROLE_LABELS[profile.role] ?? profile.role}
              </Text>
              <Text style={styles.roleHint}>(one role per account for now)</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
          <TextField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            style={styles.bioInput}
          />
          <ValuesEditor values={values} onChange={setValues} />
          <Button
            title={updateProfile.isPending ? 'Saving…' : 'Save changes'}
            onPress={handleSave}
            disabled={!isDirty || updateProfile.isPending}
          />
        </Card>

        <Card style={styles.section}>
          <ContactsSection profileId={profileId} />
        </Card>

        <Card style={styles.section}>
          <HistorySection profileId={profileId} />
        </Card>

        <Card style={styles.section}>
          <EntriesSection profileId={profileId} />
        </Card>

        {isAdmin ? (
          <Card style={styles.section}>
            <Button title="Admin" variant="secondary" onPress={() => router.push('/profile/admin')} />
          </Card>
        ) : null}

        <View style={styles.accountActions}>
          <Button title="Sign out" variant="secondary" onPress={handleSignOut} />
          <Button title="Delete account" variant="destructive" onPress={handleDeleteAccount} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSizes.md,
    color: colors.red,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.md,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.creamDark,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: fontSizes.xxl,
    color: colors.navy,
    fontWeight: fontWeights.bold,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 44,
    backgroundColor: 'rgba(27, 36, 48, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: {
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  changePhoto: {
    color: colors.brassDark,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
    marginBottom: spacing.xs,
  },
  roleText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  roleHint: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  bioInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  accountActions: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
});
