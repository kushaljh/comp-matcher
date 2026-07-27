import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';

type ValuesEditorProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

export function ValuesEditor({ values, onChange }: ValuesEditorProps) {
  const [draft, setDraft] = useState('');

  const addValue = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <View>
      <Text style={styles.label}>Values</Text>
      <View style={styles.chipRow}>
        {values.map((value) => (
          <Pressable key={value} style={styles.chip} onPress={() => removeValue(value)}>
            <Text style={styles.chipText}>{value}</Text>
            <Text style={styles.chipRemove}>×</Text>
          </Pressable>
        ))}
        {values.length === 0 && <Text style={styles.emptyText}>No values added yet.</Text>}
      </View>
      <View style={styles.addRow}>
        <TextField
          style={styles.input}
          placeholder="Add a value (e.g. musicality)"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addValue}
          returnKeyType="done"
        />
        <Pressable style={styles.addButton} onPress={addValue}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  chipRemove: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    marginLeft: spacing.xs,
    fontWeight: fontWeights.bold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.brass,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    color: colors.navy,
    fontWeight: fontWeights.semibold,
  },
});
