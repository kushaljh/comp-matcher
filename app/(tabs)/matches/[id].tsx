// The Partner Dossier — restyled match detail. A single profile photo (the
// schema has one photo, not a gallery) with a scrim identity block, the
// contact-reveal box, values, bio, and competition record. No floor-footage /
// photo-gallery section: the schema has neither video clips nor multiple
// photos per profile (see the WP log for the full list of compromises).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PhotoLightbox } from '../../../features/shared/PhotoLightbox';
import { useSignedPhotoUrl } from '../../../features/shared/photo';
import { formatLocalScene } from '../../../features/shared/location';
import { Screen } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { Chip, ContactLine } from '../../../features/matches/components';
import { formatRelativeTime } from '../../../features/matches/format';
import {
  useMatchDetail,
  useOtherContacts,
  useOtherEntry,
  useOtherHistory,
} from '../../../features/matches/hooks';

const DIVISION_LABELS: Record<string, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  follower: 'Follower',
};

const PLACEMENT_HIGHLIGHT = /1st|2nd|3rd|Finals/i;

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fonts, fs, radii } = useTheme();
  const [photoOpen, setPhotoOpen] = useState(false);
  const { data: match, isLoading, isError, error } = useMatchDetail(id);
  const otherProfileId = match?.otherProfile.id;

  const { data: entry } = useOtherEntry(
    otherProfileId,
    match?.contestId,
    match?.otherProfile.role
  );
  const { data: contacts, isLoading: contactsLoading } = useOtherContacts(otherProfileId);
  const { data: history, isLoading: historyLoading } = useOtherHistory(otherProfileId);
  // photo_url is a storage path — the profile-photos bucket is private. Called
  // here, above the early returns, so the hook order never changes.
  const photoUri = useSignedPhotoUrl(match?.otherProfile.photoUrl);

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  if (isError || !match) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.red, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'Match not found.'}
        </Text>
      </Screen>
    );
  }

  const { otherProfile } = match;
  const roleLine = [ROLE_LABELS[otherProfile.role] ?? otherProfile.role, entry ? DIVISION_LABELS[entry.division] ?? entry.division : null]
    .filter(Boolean)
    .join(' · ');
  const initial = otherProfile.displayName.trim().charAt(0).toUpperCase() || '?';
  const localScene = formatLocalScene(otherProfile);

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.photoHeader, { backgroundColor: colors.photoBg }]}>
          {photoUri ? (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="View full photo"
              onPress={() => setPhotoOpen(true)}
              style={StyleSheet.absoluteFill}
            >
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={styles.monogramWrap}>
              <Text style={{ fontFamily: fonts.serif, fontSize: fs(56), color: 'rgba(246,241,231,0.34)' }}>
                {initial}
              </Text>
            </View>
          )}
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <View style={styles.pairedRow}>
              <View style={[styles.pairedHairline, { backgroundColor: colors.brass }]} />
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fs(9),
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: colors.brass,
                }}
              >
                Paired · {formatRelativeTime(match.createdAt)}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.serif, fontSize: fs(32), lineHeight: fs(34), color: colors.ink }}>
              {otherProfile.displayName}
            </Text>
            {roleLine ? (
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fs(9),
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: colors.ink2,
                  marginTop: 5,
                }}
              >
                {roleLine}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <View
            style={[
              styles.contactBox,
              { backgroundColor: colors.likeBg, borderColor: colors.brass, borderRadius: radii.rSm },
            ]}
          >
            <View style={styles.contactBoxHeader}>
              <Text style={{ color: colors.brass, fontSize: fs(11) }}>✦</Text>
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fs(9),
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: colors.brass,
                }}
              >
                Contact unsealed
              </Text>
            </View>
            {contactsLoading ? (
              <ActivityIndicator color={colors.brass} />
            ) : !contacts || contacts.length === 0 ? (
              <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
                No contact info shared.
              </Text>
            ) : (
              contacts.map((c) => <ContactLine key={c.id} platform={c.platform} handle={c.handle} />)
            )}
          </View>

          {localScene ? (
            <View style={styles.section}>
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fs(9),
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: colors.ink2,
                }}
              >
                Local scene
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(15), color: colors.ink }}>
                {localScene}
              </Text>
            </View>
          ) : null}

          {otherProfile.values.length > 0 ? (
            <View style={styles.chipRow}>
              {otherProfile.values.map((value) => (
                <Chip key={value} label={value} />
              ))}
            </View>
          ) : null}

          {otherProfile.bio ? (
            <Text style={{ fontFamily: fonts.body, fontSize: fs(15), lineHeight: fs(24), color: colors.ink }}>
              {otherProfile.bio}
            </Text>
          ) : null}

          <View style={styles.section}>
            <Text
              style={{
                fontFamily: fonts.mono,
                fontSize: fs(9),
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: colors.ink2,
              }}
            >
              Competition record
            </Text>
            {historyLoading ? (
              <ActivityIndicator color={colors.brass} />
            ) : !history || history.length === 0 ? (
              <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
                No competition history yet.
              </Text>
            ) : (
              history.map((h) => (
                <View key={h.id} style={[styles.historyRow, { borderTopColor: colors.line }]}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.deco, fontSize: fs(18), color: colors.brass, minWidth: 46 }}>
                    {h.year}
                  </Text>
                  <View style={styles.historyText}>
                    <Text style={{ fontFamily: fonts.bodyMedium, fontSize: fs(14), color: colors.ink }}>
                      {h.contestName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: fonts.condensed,
                        fontSize: fs(12),
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        color: colors.ink2,
                        marginTop: 2,
                      }}
                    >
                      {h.eventName}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: fonts.condensedSemi,
                      fontSize: fs(12),
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: h.placement && PLACEMENT_HIGHLIGHT.test(h.placement) ? colors.brass : colors.ink2,
                    }}
                  >
                    {h.placement ?? 'No placement recorded'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <PhotoLightbox uri={photoUri} visible={photoOpen} onClose={() => setPhotoOpen(false)} />

      <View style={[styles.footer, { backgroundColor: colors.scrim, borderTopColor: colors.line }]}>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: fs(8.5),
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: colors.ink2,
            lineHeight: fs(13),
          }}
        >
          {match.eventName}
          {'\n'}
          {match.contestName}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backPill, { borderColor: colors.brass, borderRadius: radii.pill }]}
        >
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(13),
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: colors.brass,
            }}
          >
            Back to the card
          </Text>
        </Pressable>
      </View>
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
    paddingBottom: 24,
  },
  photoHeader: {
    height: 214,
    position: 'relative',
    overflow: 'hidden',
  },
  monogramWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
  },
  pairedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pairedHairline: {
    width: 18,
    height: 1,
  },
  body: {
    padding: 20,
    gap: 22,
  },
  contactBox: {
    padding: 18,
    borderWidth: 1,
    gap: 8,
  },
  contactBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  section: {
    gap: 9,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 18,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
  },
  backPill: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
});
