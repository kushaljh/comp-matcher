import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
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
  const { colors, fonts, fs, radii } = useTheme();
  const [form, setForm] = useState(initial);

  return (
    <View style={[styles.form, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
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
          style={[
            styles.smallButton,
            { borderColor: colors.brass, borderRadius: radii.pill },
            !isValid(form) && styles.smallButtonDisabled,
          ]}
          disabled={!isValid(form)}
          onPress={() => onSubmit(form)}
        >
          <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(11.5), letterSpacing: 1, textTransform: 'uppercase', color: colors.brass }}>
            {submitLabel}
          </Text>
        </Pressable>
        <Pressable style={[styles.smallButton, { borderColor: colors.brass, borderRadius: radii.pill }]} onPress={onCancel}>
          <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(11.5), letterSpacing: 1, textTransform: 'uppercase', color: colors.brass }}>
            Cancel
          </Text>
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
  const { colors, fonts, fs } = useTheme();
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
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: fs(9),
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.ink2,
          }}
        >
          Competition history
        </Text>
        {!adding && (
          <Pressable onPress={() => setAdding(true)}>
            <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(12), letterSpacing: 1, textTransform: 'uppercase', color: colors.brass }}>
              + Add
            </Text>
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
          <View key={row.id} style={[styles.row, { borderTopColor: colors.line }]}>
            <Text style={{ fontFamily: fonts.deco, fontSize: fs(18), color: colors.brass, width: 46 }}>
              {row.year}
            </Text>
            <View style={styles.rowText}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: fs(14), color: colors.ink }}>
                {row.contest_name} @ {row.event_name}
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2, marginTop: 2 }}>
                {row.placement ?? 'No placement recorded'}
              </Text>
              <View style={styles.formActions}>
                <Pressable onPress={() => setEditingId(row.id)}>
                  <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: colors.brass }}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => deleteHistory.mutate(row.id)}>
                  <Text style={{ fontFamily: fonts.condensedSemi, fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: colors.red }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
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
        <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
          No competition history yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  form: {
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  formActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  smallButtonDisabled: {
    opacity: 0.5,
  },
});
