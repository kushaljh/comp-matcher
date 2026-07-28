// Your Card — the profile the other side of the floor sees once matched.
// Sign-out and delete-account live in Settings now (verified working there);
// this screen only edits the card itself.
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSignedPhotoUrl } from '../../../features/shared/photo';
import { useIsAdmin } from '../../../features/admin/hooks';
import { ContactsSection } from '../../../features/profile/components/ContactsSection';
import { EntriesSection } from '../../../features/profile/components/EntriesSection';
import { HistorySection } from '../../../features/profile/components/HistorySection';
import { MediaSection } from '../../../features/profile/components/MediaSection';
import { ValuesEditor } from '../../../features/profile/components/ValuesEditor';
import {
  useCurrentUserId,
  useMyProfile,
  useUpdateProfile,
  useUploadPhoto,
} from '../../../features/profile/hooks';


export default function ProfileScreen() {
  const router = useRouter();
  const { colors, fonts, fs, radii } = useTheme();
  const { data: profile, profileId, isLoading, isError, error } = useMyProfile();
  const { data: userId } = useCurrentUserId();
  const { data: isAdmin } = useIsAdmin();

  const updateProfile = useUpdateProfile(profileId);
  const uploadPhoto = useUploadPhoto(profileId, userId ?? undefined);
  // photo_url holds a storage path; the bucket is private.
  const photoUri = useSignedPhotoUrl(profile?.photo_url);

  const [initialized, setInitialized] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (profile && !initialized) {
      setDisplayName(profile.display_name);
      setBio(profile.bio ?? '');
      setValues(profile.values);
      setCity(profile.city ?? '');
      setStateRegion(profile.state ?? '');
      setCountry(profile.country ?? '');
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
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.red, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'Could not load your profile.'}
        </Text>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.red, textAlign: 'center' }}>
          Complete your profile setup to continue.
        </Text>
      </Screen>
    );
  }

  const isDirty =
    displayName !== profile.display_name ||
    bio !== (profile.bio ?? '') ||
    JSON.stringify(values) !== JSON.stringify(profile.values) ||
    city !== (profile.city ?? '') ||
    stateRegion !== (profile.state ?? '') ||
    country !== (profile.country ?? '');

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
      // All three are independently optional — blank means "not saying".
      city: city.trim() || null,
      state: stateRegion.trim() || null,
      country: country.trim() || null,
    });
  };

  const monoLabel = {
    fontFamily: fonts.mono,
    fontSize: fs(9),
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.ink2,
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View>
          <Text style={{ fontFamily: fonts.display, fontSize: fs(25), letterSpacing: 1.2, color: colors.ink }}>
            Your Profile
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 5 }}>
            This is the card the other side of the floor sees.
          </Text>
          <View style={styles.deco}>
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
            <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
            <View style={[styles.diamond, { borderWidth: 1, borderColor: colors.cardLine }]} />
            <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.photoRow}>
            <Pressable onPress={pickPhoto} disabled={uploadPhoto.isPending}>
              <View style={[styles.photoTile, { borderColor: colors.brass, borderRadius: radii.rSm }]}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface2 }]}>
                    <Text style={{ fontFamily: fonts.serif, fontSize: fs(30), color: colors.brass }}>
                      {profile.display_name.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                {uploadPhoto.isPending && (
                  <View style={[styles.photoOverlay, { backgroundColor: colors.scrim }]}>
                    <ActivityIndicator color={colors.ink} />
                  </View>
                )}
              </View>
            </Pressable>
            <View style={styles.photoText}>
              <Text style={monoLabel}>Portrait</Text>
              <Pressable onPress={pickPhoto} disabled={uploadPhoto.isPending} style={{ marginTop: 6 }}>
                <Text
                  style={{
                    fontFamily: fonts.condensedSemi,
                    fontSize: fs(13),
                    letterSpacing: 0.6,
                    color: colors.brass,
                  }}
                >
                  Change photo
                </Text>
              </Pressable>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2, marginTop: 6 }}>
                Your first photo. Add more below.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <TextField label="Name" value={displayName} onChangeText={setDisplayName} />

          <View style={styles.fieldGap}>
            <TextField
              label="Your pitch"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              style={styles.bioInput}
            />
          </View>

          <View style={styles.fieldGap}>
            <Text style={[monoLabel, { marginBottom: 6 }]}>Local scene · optional</Text>
            <TextField label="City" value={city} onChangeText={setCity} />
            {/* "State / region", not "State" — most countries don't have states,
                and every part of this is optional. */}
            <TextField label="State / region" value={stateRegion} onChangeText={setStateRegion} />
            <TextField label="Country" value={country} onChangeText={setCountry} />
          </View>

          <Button
            title={updateProfile.isPending ? 'Saving…' : 'Save changes'}
            onPress={handleSave}
            disabled={!isDirty || updateProfile.isPending}
          />
        </View>

        <View style={styles.section}>
          <MediaSection profileId={profileId} userId={userId ?? undefined} />
        </View>

        <View style={styles.section}>
          <ContactsSection profileId={profileId} />
        </View>

        <View style={styles.section}>
          <EntriesSection profileId={profileId} />
        </View>

        <View style={styles.section}>
          <ValuesEditor values={values} onChange={setValues} />
        </View>

        <View style={styles.section}>
          <HistorySection profileId={profileId} />
        </View>

        {isAdmin ? (
          <View style={[styles.section, styles.adminRow]}>
            <Button title="Admin" variant="secondary" onPress={() => router.push('/profile/admin')} />
          </View>
        ) : null}
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
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 22,
  },
  deco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13,
    width: 240,
  },
  decoRule: {
    flex: 1,
    height: 1,
  },
  diamond: {
    width: 5,
    height: 5,
    transform: [{ rotate: '45deg' }],
  },
  section: {
    gap: 10,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  photoTile: {
    width: 92,
    aspectRatio: 3 / 4,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  photoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  photoText: {
    flex: 1,
    minWidth: 0,
  },
  fieldGap: {
    marginTop: 4,
  },
  bioInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  adminRow: {
    marginTop: 8,
  },
});
