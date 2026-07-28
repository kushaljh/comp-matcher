// The full card: what you get for tapping the middle of the top card. Sits
// over the deck area, scrolls, and leaves the ✕ / ↺ / ✓ row underneath it live —
// liking or passing from here goes through the deck's one commit path.

import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PhotoLightbox } from '../shared/PhotoLightbox';
import { useTheme } from '../../theme/ThemeProvider';
import { Monogram, ScrimRamp } from './CardContent';
import { RiseIn } from './Decor';
import { withAlpha } from './tint';
import type { CompetitionHistoryRow, DeckCard } from './types';

type ExpandedCardProps = {
  card: DeckCard;
  history: CompetitionHistoryRow[];
  roleLine: string;
  onClose: () => void;
};

/** The design brasses up a result worth bragging about. */
const PODIUM = /1st|2nd|3rd|finals/i;

export function ExpandedCard({ card, history, roleLine, onClose }: ExpandedCardProps) {
  const { colors, fonts, fs, radii } = useTheme();
  const initial = card.display_name.trim().charAt(0).toUpperCase() || '?';
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <RiseIn style={styles.host}>
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderRadius: radii.r, borderColor: colors.cardLine },
        ]}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.photo, { backgroundColor: colors.photoBg }]}>
            {card.photo_url ? (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel="View full photo"
                onPress={() => setPhotoOpen(true)}
                style={StyleSheet.absoluteFill}
              >
                <Image source={{ uri: card.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Pressable>
            ) : (
              <Monogram initial={initial} size={96} />
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close the full card"
              style={[styles.close, { borderColor: withAlpha(colors.ink, 0.4) }]}
            >
              <Text style={{ fontFamily: fonts.body, fontSize: fs(15), lineHeight: fs(18), color: colors.ink }}>
                ✕
              </Text>
            </Pressable>
            <View style={styles.photoFoot} pointerEvents="none">
              <ScrimRamp color={colors.scrim} />
              <View style={[styles.photoFootInner, { backgroundColor: colors.scrim }]}>
                <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontSize: fs(31), lineHeight: fs(33), color: colors.ink }}>
                  {card.display_name}
                </Text>
                <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.brass, marginTop: 6 }]}>
                  {roleLine}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.body}>
            {card.bio ? (
              <Text style={{ fontFamily: fonts.body, fontSize: fs(15), lineHeight: fs(24), color: colors.ink }}>
                {card.bio}
              </Text>
            ) : null}

            {card.note ? (
              <View style={styles.block}>
                <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
                  Note on this entry
                </Text>
                <Text style={{ fontFamily: fonts.body, fontSize: fs(14), lineHeight: fs(22), color: colors.ink2 }}>
                  {card.note}
                </Text>
              </View>
            ) : null}

            {history.length > 0 ? (
              <View style={styles.block}>
                <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
                  Competition record
                </Text>
                <View>
                  {history.map((row) => (
                    <View key={row.id} style={[styles.historyRow, { borderTopColor: colors.line }]}>
                      <Text numberOfLines={1} style={{ fontFamily: fonts.deco, fontSize: fs(18), color: colors.brass, minWidth: 46 }}>
                        {row.year}
                      </Text>
                      <View style={styles.historyMain}>
                        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: fs(14), color: colors.ink }}>
                          {row.contest_name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: fonts.condensed,
                            fontSize: fs(12),
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: colors.ink2,
                          }}
                        >
                          {row.event_name}
                        </Text>
                      </View>
                      {row.placement ? (
                        <Text
                          style={{
                            fontFamily: fonts.condensed,
                            fontSize: fs(12),
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            paddingLeft: 14,
                            color: PODIUM.test(row.placement) ? colors.brass : colors.ink2,
                          }}
                        >
                          {row.placement}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={[styles.sealed, { borderColor: colors.line, borderRadius: radii.rSm }]}>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(13), lineHeight: fs(20), color: colors.ink2 }}>
                Contact details stay sealed until you both say yes. Ask &apos;em and find out.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.scrim }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={[styles.closeBar, { borderColor: colors.line, borderRadius: radii.pill }]}
          >
            <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
              ↓ Close the card
            </Text>
          </Pressable>
        </View>
      </View>
      <PhotoLightbox uri={card.photo_url} visible={photoOpen} onClose={() => setPhotoOpen(false)} />
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
  },
  sheet: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  photo: {
    height: 212,
    overflow: 'hidden',
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 3,
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,14,19,0.6)',
  },
  photoFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoFootInner: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 22,
  },
  block: {
    gap: 9,
  },
  micro: {
    letterSpacing: 1.9,
    textTransform: 'uppercase',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 18,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
  },
  sealed: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 11,
    borderTopWidth: 1,
  },
  closeBar: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
});
