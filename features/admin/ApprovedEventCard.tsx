import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import { Constants } from '../../lib/database.types';
import type { Enums } from '../../lib/database.types';
import { formatDateRange } from '../events/format';
import type { ContestRow, EventRow } from './api';
import { useAddContest, useAdminContestsForEvent, useDeleteContest } from './hooks';

const DIVISIONS = Constants.public.Enums.division;

// One contest row: name + division chips + an inline-confirm delete (matches
// features/events/ContestCard.tsx's established confirm pattern).
function ContestRowItem({ contest, eventId }: { contest: ContestRow; eventId: string }) {
  const deleteMutation = useDeleteContest(eventId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await deleteMutation.mutateAsync(contest.id);
      setConfirmingDelete(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete this contest.');
      setConfirmingDelete(false);
    }
  }

  return (
    <View style={styles.contestRow}>
      <Text style={styles.contestName}>{contest.name}</Text>
      <View style={styles.chipsRow}>
        {contest.divisions.map((d) => (
          <View key={d} style={styles.chip}>
            <Text style={styles.chipText}>{d}</Text>
          </View>
        ))}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.buttonRow}>
        {confirmingDelete ? (
          <>
            <Text style={styles.confirmText}>Delete? Entries cascade too.</Text>
            <Button
              title="Confirm delete"
              variant="destructive"
              onPress={handleDelete}
              loading={deleteMutation.isPending}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} />
          </>
        ) : (
          <Button title="Delete" variant="destructive" onPress={() => setConfirmingDelete(true)} />
        )}
      </View>
    </View>
  );
}

export function ApprovedEventCard({ event }: { event: EventRow }) {
  const { data: contests, isLoading: contestsLoading } = useAdminContestsForEvent(event.id);
  const addMutation = useAddContest(event.id);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [divisions, setDivisions] = useState<Enums<'division'>[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleDivision(d: Enums<'division'>) {
    setDivisions((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleAdd() {
    if (!name.trim()) {
      setError('Contest name is required.');
      return;
    }
    if (divisions.length === 0) {
      setError('Pick at least one division.');
      return;
    }
    setError(null);
    try {
      await addMutation.mutateAsync({ name: name.trim(), divisions });
      setName('');
      setDivisions([]);
      setAdding(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not add this contest.');
    }
  }

  const hasNoContests = !contestsLoading && (contests?.length ?? 0) === 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.name}>{event.name}</Text>
      <Text style={styles.dates}>{formatDateRange(event.start_date, event.end_date)}</Text>

      {contestsLoading ? (
        <Text style={styles.status}>Loading contests…</Text>
      ) : hasNoContests ? (
        // Nudge: an approved event with zero contests isn't joinable yet.
        <Text style={styles.nudge}>No contests yet — add one so dancers can join this event.</Text>
      ) : (
        (contests ?? []).map((contest) => (
          <ContestRowItem key={contest.id} contest={contest} eventId={event.id} />
        ))
      )}

      {adding ? (
        <View style={styles.addForm}>
          <TextField label="Contest name" value={name} onChangeText={setName} />
          <Text style={styles.label}>Divisions</Text>
          <View style={styles.chipsRow}>
            {DIVISIONS.map((d) => (
              <Pressable key={d} onPress={() => toggleDivision(d)}>
                <View style={[styles.chip, divisions.includes(d) && styles.chipSelected]}>
                  <Text style={[styles.chipText, divisions.includes(d) && styles.chipTextSelected]}>{d}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <Button title="Add contest" onPress={handleAdd} loading={addMutation.isPending} />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setAdding(false);
                setError(null);
                setName('');
                setDivisions([]);
              }}
            />
          </View>
        </View>
      ) : (
        <Button title="Add contest" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  name: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  dates: {
    fontSize: fontSizes.sm,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  status: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  nudge: {
    fontSize: fontSizes.sm,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.sm,
  },
  contestRow: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contestName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
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
    marginBottom: spacing.xs,
  },
  addForm: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
  },
});
