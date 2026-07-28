// Shared "what you're after" input — used by onboarding AND Your Card so both
// surfaces offer the same thing: preset tags to tap plus a custom text entry.
// Selected values render as filled chips (tap to remove); unselected presets
// render as outline chips (tap to add); the text box adds anything custom.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { VALUES } from './constants';

type ValuesFieldProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

export function ValuesField({ values, onChange }: ValuesFieldProps) {
  const { colors, fonts, fs, radii } = useTheme();
  const [draft, setDraft] = useState('');

  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());

  const add = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed || has(trimmed)) return;
    onChange([...values, trimmed]);
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const submitDraft = () => {
    add(draft);
    setDraft('');
  };

  const presets = VALUES.filter((v) => !has(v));

  const chipText = (selected: boolean) => ({
    fontFamily: fonts.condensedSemi,
    fontSize: fs(12.5),
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: selected ? colors.ink : colors.ink2,
  });

  return (
    <View>
      {values.length > 0 ? (
        <View style={styles.chipRow}>
          {values.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${value}`}
              onPress={() => remove(value)}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.likeBg,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: colors.brass,
                },
              ]}
            >
              <Text style={chipText(true)}>{value}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: fs(11), color: colors.ink2 }}> ✕</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {presets.length > 0 ? (
        <>
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: fs(8.5),
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: colors.ink2,
              marginBottom: 6,
            }}
          >
            Tap to add
          </Text>
          <View style={styles.chipRow}>
            {presets.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => add(value)}
                style={[
                  styles.chip,
                  { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line },
                ]}
              >
                <Text style={chipText(false)}>+ {value}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.customRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitDraft}
          placeholder="Or write your own…"
          placeholderTextColor={colors.ink2}
          returnKeyType="done"
          style={[
            styles.input,
            {
              backgroundColor: colors.fieldBg,
              borderColor: colors.line,
              color: colors.ink,
              fontFamily: fonts.body,
              fontSize: fs(14),
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={submitDraft}
          disabled={!draft.trim()}
          style={[
            styles.addBtn,
            {
              borderRadius: radii.pill,
              backgroundColor: draft.trim() ? colors.brass : 'transparent',
              borderWidth: 1,
              borderColor: draft.trim() ? colors.brass : colors.line,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: fonts.condensedSemi,
              fontSize: fs(12),
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: draft.trim() ? colors.bg : colors.ink2,
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
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  addBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
});
