// Everyone this entry has passed on, offered back when the floor clears.
//
// A pass is the one swipe the schema lets you take back (swipes_delete_own_pass
// permits deleting your own row, direction 'pass', and nothing else), so this
// list is actionable in a way a list of likes could never be.

import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useSignedPhotoUrls } from '../shared/photo';
import { TestPill } from '../shared/TestPill';
import { withAlpha } from './tint';
import type { DeckCard } from './types';

type PassedListProps = {
  cards: DeckCard[];
  /** Profile ids currently being put back, so their row can show progress. */
  restoring: string[];
  onRestore: (card: DeckCard) => void;
};

/**
 * Row-sized stand-in for a missing photo. CardContent's Monogram is absolutely
 * positioned to fill a card, so it can't be borrowed at this scale.
 */
function Initial({ name }: { name: string }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.photoBg, borderColor: withAlpha(colors.ink, 0.16) },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.serif,
          fontSize: fs(19),
          lineHeight: fs(24),
          color: withAlpha(colors.ink, 0.34),
        }}
      >
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function PassedList({ cards, restoring, onRestore }: PassedListProps) {
  const { colors, fonts, fs, radii } = useTheme();
  // One signing round-trip for every face in the list, same as the deck does.
  const photoUrls = useSignedPhotoUrls(cards.map((c) => c.photo_url));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={[styles.rule, { backgroundColor: colors.cardLine }]} />
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: fs(8.5),
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.ink2,
          }}
        >
          You passed on {cards.length}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.cardLine }]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {cards.map((card) => {
          const uri = card.photo_url ? (photoUrls[card.photo_url] ?? null) : null;
          const busy = restoring.includes(card.profile_id);
          const place = [card.city, card.state ?? card.country].filter(Boolean).join(', ');
          return (
            <View
              key={card.profile_id}
              style={[styles.row, { borderColor: colors.line, borderRadius: radii.rSm }]}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.avatar} contentFit="cover" />
              ) : (
                <Initial name={card.display_name} />
              )}

              <View style={styles.identity}>
                <View style={styles.nameRow}>
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1, fontFamily: fonts.serif, fontSize: fs(16), color: colors.ink }}
                  >
                    {card.display_name}
                  </Text>
                  {card.is_test ? <TestPill /> : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: fs(8.5),
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: colors.ink2,
                  }}
                >
                  {place ? `${card.division} · ${place}` : card.division}
                </Text>
              </View>

              <Pressable
                onPress={() => onRestore(card)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Put ${card.display_name} back on the floor`}
                style={[
                  styles.restore,
                  {
                    borderRadius: radii.pill,
                    borderColor: busy ? colors.line : colors.brass,
                    opacity: busy ? 0.5 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: fonts.condensedSemi,
                    fontSize: fs(11),
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: busy ? colors.ink2 : colors.brass,
                  }}
                >
                  {busy ? 'Adding' : 'Look again'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 10,
    // Never let the list push the empty panel's own copy off screen; the
    // ScrollView below takes over once there are more than a few faces.
    flexShrink: 1,
    minHeight: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  rule: {
    flex: 1,
    height: 1,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    // Belt and braces with flexShrink above: on a short panel the shrink keeps
    // the buttons visible, and on a tall one this stops a long list from
    // swallowing the whole card. Neither alone covers both ends.
    maxHeight: 250,
  },
  list: {
    gap: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  restore: {
    borderWidth: 1,
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
});
