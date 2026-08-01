// The design's ticket stubs: one torn-off stub per contest the dancer has
// entered, in a horizontally snapping row. The active stub gets a 4px brass
// edge bar, a brass hairline and a tinted wash.

import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { DanceRole, MyEntry } from './types';

const ROLE_VERB: Record<DanceRole, string> = {
  leader: 'leading',
  follower: 'following',
};

/**
 * Stubs are a fixed width so the row can snap to a real interval. With the old
 * min/max pair every stub was a different width, `snapToAlignment` had nothing
 * to align to, and the row came to rest wherever the flick ended — usually with
 * a half-cut stub parked at the reading edge.
 */
const STUB_W = 224;
const STUB_GAP = 8;

/**
 * Web needs its own snapping. react-native-web's ScrollView does not implement
 * snapToInterval / snapToOffsets / snapToAlignment AT ALL — grep its source and
 * the props are absent; the only thing that emits CSS scroll-snap there is
 * `pagingEnabled`, which snaps by viewport width rather than by stub and so
 * lands in the wrong place for a 224px stub in a 358px column. So the web build
 * gets the CSS properties directly, which is what snapToInterval would have
 * compiled to if it existed.
 *
 * The casts are because these are CSS properties React Native's ViewStyle has
 * no names for. react-native-web passes them straight through (it uses both
 * itself); native never sees them.
 */
const SNAP_X = Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as unknown as ViewStyle) : null;
const SNAP_CHILD = Platform.OS === 'web' ? ({ scrollSnapAlign: 'start' } as unknown as ViewStyle) : null;

type ContestStubsProps = {
  entries: MyEntry[];
  selectedEntryId: string | null;
  /** entryId -> dancers still on that floor. Missing while the deck loads. */
  counts: Record<string, number>;
  onSelect: (entryId: string) => void;
};

export function ContestStubs({
  entries,
  selectedEntryId,
  counts,
  onSelect,
}: ContestStubsProps) {
  const { colors, fonts, fs, radii } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={STUB_W + STUB_GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      // Must not flex-grow into the column, and the stubs must not stretch to
      // fill it — without both, react-native-web renders them as huge cards.
      // SNAP_X is the web half of the two snapToInterval props above.
      style={[styles.scroll, SNAP_X]}
      contentContainerStyle={styles.row}
    >
      {entries.map((entry) => {
        const active = entry.entryId === selectedEntryId;
        const left = counts[entry.entryId];
        return (
          <Pressable
            key={entry.entryId}
            onPress={() => onSelect(entry.entryId)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.stub,
              SNAP_CHILD,
              {
                borderRadius: radii.rSm,
                borderColor: active ? colors.brass : colors.line,
                backgroundColor: active ? colors.likeBg : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.edge,
                { backgroundColor: active ? colors.brass : 'transparent' },
              ]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.event,
                { fontFamily: fonts.condensed, fontSize: fs(11), color: active ? colors.ink : colors.ink2 },
              ]}
            >
              {entry.eventName}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.contest,
                {
                  fontFamily: fonts.condensedSemi,
                  fontSize: fs(14.5),
                  color: active ? colors.ink : colors.ink2,
                },
              ]}
            >
              {entry.contestName}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.meta, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}
            >
              {/* The role is always shown: a dancer entered in one contest at
                  both roles gets two stubs that are otherwise identical. */}
              {left === undefined
                ? `${entry.division} · ${ROLE_VERB[entry.role]}`
                : `${left} on the floor · ${entry.division} · ${ROLE_VERB[entry.role]}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    gap: STUB_GAP,
    paddingBottom: 2,
    alignItems: 'flex-start',
  },
  stub: {
    position: 'relative',
    width: STUB_W,
    overflow: 'hidden',
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: 7,
    paddingLeft: 20,
    paddingRight: 16,
    gap: 2,
  },
  edge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  event: {
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.62,
  },
  contest: {
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  meta: {
    letterSpacing: 0.9,
    opacity: 0.62,
  },
});
