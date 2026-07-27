import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';
import { confirmAsync } from '../confirm';
import { useDeleteEntry, useMyEntries } from '../hooks';

const DIVISION_LABELS: Record<string, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

export function EntriesSection({ profileId }: { profileId: string | undefined }) {
  const { data: entries, isLoading } = useMyEntries(profileId);
  const deleteEntry = useDeleteEntry(profileId);

  const rows = entries ?? [];

  const handleLeave = async (id: string, contestName: string, eventName: string) => {
    const confirmed = await confirmAsync(
      'Leave contest?',
      `You'll leave "${contestName}" at ${eventName}. Any match made through this entry stays, but you won't appear in this contest's deck anymore.`,
      'Leave'
    );
    if (confirmed) deleteEntry.mutate(id);
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>My entries</Text>
      {isLoading && <ActivityIndicator color={colors.brass} />}
      {!isLoading && rows.length === 0 && (
        <Text style={styles.hint}>You haven&apos;t entered any contests yet.</Text>
      )}
      {rows.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {entry.contestName} @ {entry.eventName}
            </Text>
            <Text style={styles.rowSubtitle}>
              {DIVISION_LABELS[entry.division] ?? entry.division}
              {entry.note ? ` · ${entry.note}` : ''}
            </Text>
          </View>
          <Pressable
            style={styles.leaveButton}
            onPress={() => handleLeave(entry.id, entry.contestName, entry.eventName)}
          >
            <Text style={styles.leaveButtonText}>Leave</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  rowTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  leaveButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.red,
  },
  leaveButtonText: {
    color: colors.red,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
});
