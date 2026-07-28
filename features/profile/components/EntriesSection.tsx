import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { confirmAsync } from '../confirm';
import { useDeleteEntry, useMyEntries } from '../hooks';

const DIVISION_LABELS: Record<string, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

export function EntriesSection({ profileId }: { profileId: string | undefined }) {
  const { colors, fonts, fs, radii } = useTheme();
  const { data: entries, isLoading } = useMyEntries(profileId);
  const deleteEntry = useDeleteEntry(profileId);

  const rows = entries ?? [];

  const handleLeave = async (id: string, contestId: string, contestName: string, eventName: string) => {
    const confirmed = await confirmAsync(
      'Leave contest?',
      `You'll leave "${contestName}" at ${eventName}. Pairings from this contest are dissolved on BOTH dance cards, and you won't appear in its deck anymore.`,
      'Leave'
    );
    if (confirmed) deleteEntry.mutate({ entryId: id, contestId });
  };

  return (
    <View>
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: fs(9),
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: colors.ink2,
          marginBottom: 9,
        }}
      >
        Your entries · one division per contest
      </Text>
      {isLoading && <ActivityIndicator color={colors.brass} />}
      {!isLoading && rows.length === 0 && (
        <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
          Nothing entered yet — pick a contest in The Season.
        </Text>
      )}
      <View style={styles.list}>
        {rows.map((entry) => (
          <View key={entry.id} style={[styles.row, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
            <View style={styles.rowText}>
              <Text style={{ fontFamily: fonts.serif, fontSize: fs(17), color: colors.ink, lineHeight: fs(21) }}>
                {entry.eventName}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.condensed,
                  fontSize: fs(12),
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: colors.ink2,
                  marginTop: 2,
                }}
              >
                {entry.contestName}
              </Text>
            </View>
            <View style={[styles.divisionPill, { backgroundColor: colors.brass, borderRadius: radii.pill }]}>
              <Text
                style={{
                  fontFamily: fonts.condensedSemi,
                  fontSize: fs(11.5),
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: colors.bg,
                }}
              >
                {DIVISION_LABELS[entry.division] ?? entry.division}
              </Text>
            </View>
            <Pressable
              style={[styles.leaveButton, { borderColor: colors.red }]}
              onPress={() => handleLeave(entry.id, entry.contestId, entry.contestName, entry.eventName)}
            >
              <Text
                style={{
                  fontFamily: fonts.condensedSemi,
                  fontSize: fs(11),
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: colors.red,
                }}
              >
                Leave
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2, marginTop: 9 }}>
        Your role is fixed account-wide, but division is set per entry — novice at one event and
        advanced at another is fine.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  divisionPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  leaveButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
