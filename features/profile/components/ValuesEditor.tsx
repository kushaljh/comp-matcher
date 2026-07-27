import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';

type ValuesEditorProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

export function ValuesEditor({ values, onChange }: ValuesEditorProps) {
  const { colors, fonts, fs, radii } = useTheme();
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
        What you&apos;re after
      </Text>
      <View style={styles.chipRow}>
        {values.map((value) => (
          <Pressable
            key={value}
            style={[
              styles.chip,
              { backgroundColor: colors.likeBg, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line },
            ]}
            onPress={() => removeValue(value)}
          >
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(12.5),
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: colors.ink,
              }}
            >
              {value}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: fs(15), color: colors.ink2, marginLeft: 6 }}>×</Text>
          </Pressable>
        ))}
        {values.length === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
            No values added yet.
          </Text>
        )}
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
        <Pressable style={[styles.addButton, { backgroundColor: colors.brass, borderRadius: radii.rSm }]} onPress={addValue}>
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(12.5),
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.bg,
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  input: {
    flex: 1,
  },
  addButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 0,
  },
});
