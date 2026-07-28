// Your Card's controls for the extra photos and the spotlight clips.
//
// The PRIMARY photo is not managed here — it stays mandatory and keeps its own
// "Change photo" control above. This section only adds and removes the optional
// extras, so there is no way to end up with a profile that has no photo at all.

import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSignedPhotoUrls } from '../../shared/photo';
import { MAX_CLIPS, MAX_EXTRA_PHOTOS } from '../../shared/media';
import { CLIP_PLATFORM_LABELS, validateClipUrl, type ClipPlatform } from '../clipValidation';
import {
  useAddClip,
  useAddGalleryPhoto,
  useDeleteClip,
  useDeleteGalleryPhoto,
  useMyClips,
  useMyGalleryPhotos,
} from '../hooks';

export function MediaSection({
  profileId,
  userId,
}: {
  profileId: string | undefined;
  userId: string | undefined;
}) {
  const { colors, fonts, fs, radii } = useTheme();

  const { data: photos } = useMyGalleryPhotos(profileId);
  const { data: clips } = useMyClips(profileId);
  const addPhoto = useAddGalleryPhoto(profileId, userId);
  const deletePhoto = useDeleteGalleryPhoto(profileId);
  const addClip = useAddClip(profileId);
  const deleteClip = useDeleteClip(profileId);

  const photoList = photos ?? [];
  const clipList = clips ?? [];
  const signed = useSignedPhotoUrls(photoList.map((p) => p.path));

  const [clipUrl, setClipUrl] = useState('');
  const [clipError, setClipError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const label = {
    fontFamily: fonts.mono,
    fontSize: fs(9),
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.ink2,
  };
  const smallButtonText = {
    fontFamily: fonts.condensedSemi,
    fontSize: fs(11),
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.brass,
  };

  async function pickExtraPhoto() {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    addPhoto.mutate(result.assets[0].uri);
  }

  function submitClip() {
    const result = validateClipUrl(clipUrl);
    if (!result.ok) {
      setClipError(result.error);
      return;
    }
    setClipError(null);
    addClip.mutate(result.value, {
      onSuccess: () => setClipUrl(''),
    });
  }

  return (
    <View style={styles.wrap}>
      {/* ---- extra photos ---- */}
      <View>
        <Text style={label}>More photographs · optional</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2, marginTop: 4, marginBottom: 9 }}>
          Up to {MAX_EXTRA_PHOTOS} beyond your portrait. Your portrait stays your first photo.
        </Text>

        <View style={styles.thumbRow}>
          {photoList.map((photo) => (
            <View key={photo.id} style={styles.thumbCol}>
              <View style={[styles.thumb, { backgroundColor: colors.photoBg, borderColor: colors.line }]}>
                {signed[photo.path] ? (
                  <Image
                    source={{ uri: signed[photo.path] }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
              </View>
              <Pressable onPress={() => deletePhoto.mutate(photo)} style={styles.smallButton}>
                <Text style={[smallButtonText, { color: colors.red }]}>Remove</Text>
              </Pressable>
            </View>
          ))}

          {photoList.length < MAX_EXTRA_PHOTOS ? (
            <Pressable
              onPress={pickExtraPhoto}
              disabled={addPhoto.isPending}
              style={[
                styles.thumb,
                styles.addTile,
                { borderColor: colors.brass, backgroundColor: colors.fieldBg },
              ]}
            >
              {addPhoto.isPending ? (
                <ActivityIndicator color={colors.brass} />
              ) : (
                <Text style={{ fontFamily: fonts.serif, fontSize: fs(24), color: colors.brass }}>+</Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {photoError ? (
          <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.red, marginTop: 6 }}>
            {photoError}
          </Text>
        ) : null}
      </View>

      {/* ---- clips ---- */}
      <View>
        <Text style={label}>Floor footage · optional</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2, marginTop: 4, marginBottom: 9 }}>
          Up to {MAX_CLIPS} clips from YouTube, Instagram, or TikTok. Only YouTube shows a preview
          frame; the others show a placeholder.
        </Text>

        {clipList.map((clip) => (
          <View
            key={clip.id}
            style={[styles.clipRow, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}
          >
            <View style={styles.clipMain}>
              <Text style={[label, { marginBottom: 2 }]}>
                {CLIP_PLATFORM_LABELS[clip.platform as ClipPlatform]}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.mono, fontSize: fs(12), color: colors.ink }}
              >
                {clip.url}
              </Text>
            </View>
            <Pressable onPress={() => deleteClip.mutate(clip.id)} style={styles.smallButton}>
              <Text style={[smallButtonText, { color: colors.red }]}>Remove</Text>
            </Pressable>
          </View>
        ))}

        {clipList.length < MAX_CLIPS ? (
          <>
            <View style={styles.addClipRow}>
              <TextField
                style={styles.clipInput}
                placeholder="Paste a video link"
                value={clipUrl}
                onChangeText={setClipUrl}
                autoCapitalize="none"
              />
              <Pressable onPress={submitClip} style={styles.smallButton} disabled={addClip.isPending}>
                <Text style={smallButtonText}>{addClip.isPending ? 'Adding…' : 'Add clip'}</Text>
              </Pressable>
              {clipUrl ? (
                <Pressable
                  onPress={() => {
                    setClipUrl('');
                    setClipError(null);
                  }}
                  style={styles.smallButton}
                >
                  <Text style={smallButtonText}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
            {clipError ? (
              <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.red, marginTop: 6 }}>
                {clipError}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  thumbRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' },
  thumbCol: { alignItems: 'center' },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  addTile: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  smallButton: { paddingVertical: 6, paddingHorizontal: 4 },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
  },
  clipMain: { flex: 1, minWidth: 0 },
  addClipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clipInput: { flex: 1 },
});
