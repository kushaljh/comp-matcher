import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import type { Enums, Tables } from '../../lib/database.types';
import { useJoinContest, useLeaveContest, useMyEntry, useUpdateEntryNote } from './hooks';

type Contest = Tables<'contests'>;

export function ContestCard({
  contest,
  myProfileId,
}: {
  contest: Contest;
  myProfileId: string | null | undefined;
}) {
  const { data: myEntry, isLoading: entryLoading } = useMyEntry(contest.id, myProfileId);
  const joinMutation = useJoinContest(contest.id, myProfileId);
  const updateNoteMutation = useUpdateEntryNote(contest.id, myProfileId);
  const leaveMutation = useLeaveContest(contest.id, myProfileId);

  const [expanded, setExpanded] = useState(false);
  const [division, setDivision] = useState<Enums<'division'> | null>(null);
  const [note, setNote] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  async function handleJoin() {
    if (!division) {
      setJoinError('Pick a division first.');
      return;
    }
    if (!myProfileId) return;
    setJoinError(null);
    try {
      await joinMutation.mutateAsync({ division, note: note.trim() || null });
      setExpanded(false);
      setDivision(null);
      setNote('');
    } catch (err: any) {
      if (err?.code === '23505') {
        // Someone (or a duplicate tap) already created this entry — the
        // onSettled refetch will flip this card to the "You're in" state.
        setExpanded(false);
      } else {
        setJoinError(err?.message ?? 'Could not join this contest.');
      }
    }
  }

  async function handleSaveNote() {
    if (!myEntry) return;
    await updateNoteMutation.mutateAsync({ entryId: myEntry.id, note: noteDraft.trim() || null });
    setEditingNote(false);
  }

  async function handleLeave() {
    if (!myEntry) return;
    await leaveMutation.mutateAsync(myEntry.id);
    setConfirmingLeave(false);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.contestName}>{contest.name}</Text>
      <View style={styles.chipsRow}>
        {contest.divisions.map((d) => (
          <View key={d} style={styles.chip}>
            <Text style={styles.chipText}>{d}</Text>
          </View>
        ))}
      </View>

      {entryLoading || myProfileId == null ? null : myEntry ? (
        <View style={styles.section}>
          <Text style={styles.joinedLabel}>You're in — {myEntry.division}</Text>

          {editingNote ? (
            <View style={styles.section}>
              <TextField
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Optional note"
                multiline
              />
              <View style={styles.buttonRow}>
                <Button title="Save" onPress={handleSaveNote} loading={updateNoteMutation.isPending} />
                <Button title="Cancel" variant="secondary" onPress={() => setEditingNote(false)} />
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              {myEntry.note ? <Text style={styles.noteText}>{myEntry.note}</Text> : null}
              <View style={styles.buttonRow}>
                <Button
                  title="Edit note"
                  variant="secondary"
                  onPress={() => {
                    setNoteDraft(myEntry.note ?? '');
                    setEditingNote(true);
                  }}
                />
                {confirmingLeave ? (
                  <>
                    <Text style={styles.confirmText}>Leave this contest?</Text>
                    <Button
                      title="Confirm leave"
                      variant="destructive"
                      onPress={handleLeave}
                      loading={leaveMutation.isPending}
                    />
                    <Button title="Cancel" variant="secondary" onPress={() => setConfirmingLeave(false)} />
                  </>
                ) : (
                  <Button title="Leave contest" variant="destructive" onPress={() => setConfirmingLeave(true)} />
                )}
              </View>
            </View>
          )}
        </View>
      ) : expanded ? (
        <View style={styles.section}>
          <Text style={styles.pickLabel}>Pick your division</Text>
          <View style={styles.chipsRow}>
            {contest.divisions.map((d) => (
              <Pressable key={d} onPress={() => setDivision(d)}>
                <View style={[styles.chip, division === d && styles.chipSelected]}>
                  <Text style={[styles.chipText, division === d && styles.chipTextSelected]}>{d}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <TextField
            value={note}
            onChangeText={setNote}
            placeholder="Optional note (e.g. aiming for finals, will train weekly)"
            multiline
          />
          {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
          <View style={styles.buttonRow}>
            <Button title="Join" onPress={handleJoin} loading={joinMutation.isPending} />
            <Button title="Cancel" variant="secondary" onPress={() => setExpanded(false)} />
          </View>
        </View>
      ) : (
        <Button title="Find a partner" onPress={() => setExpanded(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  contestName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
  },
  chipText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  chipTextSelected: {
    color: colors.navy,
  },
  section: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  joinedLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.brassDark,
    textTransform: 'capitalize',
  },
  noteText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  pickLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.xs,
  },
});
