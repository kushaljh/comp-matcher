import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';
import type { HistoryRow } from '../api';
import { useAddHistory, useDeleteHistory, useHistory, useUpdateHistory } from '../hooks';

type FormState = { eventName: string; year: string; contestName: string; placement: string };

const EMPTY_FORM: FormState = { eventName: '', year: '', contestName: '', placement: '' };

function toEntry(form: FormState) {
  return {
    event_name: form.eventName.trim(),
    year: Number(form.year),
    contest_name: form.contestName.trim(),
    placement: form.placement.trim() || null,
  };
}

function isValid(form: FormState) {
  const year = Number(form.year);
  return (
    form.eventName.trim().length > 0 &&
    form.contestName.trim().length > 0 &&
    Number.isInteger(year) &&
    year > 1900
  );
}

function HistoryForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormState;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);

  return (
    <View style={styles.form}>
      <TextField
        label="Event name"
        value={form.eventName}
        onChangeText={(v) => setForm({ ...form, eventName: v })}
      />
      <TextField
        label="Contest name"
        value={form.contestName}
        onChangeText={(v) => setForm({ ...form, contestName: v })}
      />
      <TextField
        label="Year"
        value={form.year}
        onChangeText={(v) => setForm({ ...form, year: v.replace(/[^0-9]/g, '') })}
        keyboardType="number-pad"
      />
      <TextField
        label="Placement (optional)"
        value={form.placement}
        onChangeText={(v) => setForm({ ...form, placement: v })}
        placeholder="e.g. 1st, Finalist"
      />
      <View style={styles.formActions}>
        <Pressable
          style={[styles.smallButton, !isValid(form) && styles.smallButtonDisabled]}
          disabled={!isValid(form)}
          onPress={() => onSubmit(form)}
        >
          <Text style={styles.smallButtonText}>{submitLabel}</Text>
        </Pressable>
        <Pressable style={styles.smallButton} onPress={onCancel}>
          <Text style={styles.smallButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function rowToForm(row: HistoryRow): FormState {
  return {
    eventName: row.event_name,
    year: String(row.year),
    contestName: row.contest_name,
    placement: row.placement ?? '',
  };
}

export function HistorySection({ profileId }: { profileId: string | undefined }) {
  const { data: history, isLoading } = useHistory(profileId);
  const addHistory = useAddHistory(profileId);
  const updateHistory = useUpdateHistory(profileId);
  const deleteHistory = useDeleteHistory(profileId);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = history ?? [];

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Competition history</Text>
        {!adding && (
          <Pressable onPress={() => setAdding(true)}>
            <Text style={styles.addLink}>+ Add</Text>
          </Pressable>
        )}
      </View>

      {isLoading && <ActivityIndicator color={colors.brass} />}

      {rows.map((row) =>
        editingId === row.id ? (
          <HistoryForm
            key={row.id}
            initial={rowToForm(row)}
            submitLabel="Save"
            onCancel={() => setEditingId(null)}
            onSubmit={(form) =>
              updateHistory.mutate(
                { id: row.id, entry: toEntry(form) },
                { onSuccess: () => setEditingId(null) }
              )
            }
          />
        ) : (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowTitle}>
              {row.contest_name} @ {row.event_name} ({row.year})
            </Text>
            <Text style={styles.rowSubtitle}>{row.placement ?? 'No placement recorded'}</Text>
            <View style={styles.formActions}>
              <Pressable style={styles.smallButton} onPress={() => setEditingId(row.id)}>
                <Text style={styles.smallButtonText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => deleteHistory.mutate(row.id)}>
                <Text style={styles.smallButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )
      )}

      {adding && (
        <HistoryForm
          initial={EMPTY_FORM}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSubmit={(form) =>
            addHistory.mutate(toEntry(form), { onSuccess: () => setAdding(false) })
          }
        />
      )}

      {!isLoading && rows.length === 0 && !adding && (
        <Text style={styles.hint}>No competition history yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  addLink: {
    color: colors.brassDark,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    marginBottom: spacing.xs,
  },
  form: {
    backgroundColor: colors.creamDark,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  smallButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  smallButtonDisabled: {
    borderColor: colors.disabled,
    opacity: 0.5,
  },
  smallButtonText: {
    color: colors.brassDark,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
});
