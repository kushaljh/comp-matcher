// The design's ticket stubs: one torn-off stub per contest the dancer has
// entered, in a horizontally snapping row. The active stub gets a 4px brass
// edge bar, a brass hairline and a tinted wash.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { MyEntry } from './types';

type ContestStubsProps = {
  entries: MyEntry[];
  selectedContestId: string | null;
  /** contestId -> dancers still on that floor. Missing while the deck loads. */
  counts: Record<string, number>;
  onSelect: (contestId: string) => void;
};

export function ContestStubs({
  entries,
  selectedContestId,
  counts,
  onSelect,
}: ContestStubsProps) {
  const { colors, fonts, fs, radii } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      decelerationRate="fast"
      // Must not flex-grow into the column, and the stubs must not stretch to
      // fill it — without both, react-native-web renders them as huge cards.
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {entries.map((entry) => {
        const active = entry.contestId === selectedContestId;
        const left = counts[entry.contestId];
        return (
          <Pressable
            key={entry.contestId}
            onPress={() => onSelect(entry.contestId)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.stub,
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
              {left === undefined ? entry.division : `${left} on the floor · ${entry.division}`}
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
    gap: 8,
    paddingBottom: 2,
    alignItems: 'flex-start',
  },
  stub: {
    position: 'relative',
    minWidth: 182,
    maxWidth: 260,
    overflow: 'hidden',
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 9,
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
