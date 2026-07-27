import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import type { MyEntry } from './types';

type ContestPickerProps = {
  entries: MyEntry[];
  selectedContestId: string | null;
  onSelect: (contestId: string) => void;
};

// Horizontal row of chips, one per contest the caller is entered in.
export function ContestPicker({
  entries,
  selectedContestId,
  onSelect,
}: ContestPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {entries.map((entry) => {
        const selected = entry.contestId === selectedContestId;
        return (
          <Pressable
            key={entry.contestId}
            onPress={() => onSelect(entry.contestId)}
            style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
          >
            <Text
              style={[styles.event, selected ? styles.textSelected : styles.textIdle]}
              numberOfLines={1}
            >
              {entry.eventName}
            </Text>
            <Text
              style={[styles.contest, selected ? styles.textSelected : styles.subtleIdle]}
              numberOfLines={1}
            >
              {entry.contestName} · {entry.division}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipIdle: {
    backgroundColor: colors.white,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  event: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  contest: {
    fontSize: fontSizes.xs,
    textTransform: 'capitalize',
  },
  textIdle: {
    color: colors.textPrimary,
  },
  subtleIdle: {
    color: colors.textSecondary,
  },
  textSelected: {
    color: colors.textInverse,
  },
});
