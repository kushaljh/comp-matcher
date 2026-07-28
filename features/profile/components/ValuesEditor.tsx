import { Text, View } from 'react-native';
import { ValuesField } from '../../auth/ValuesField';
import { useTheme } from '../../../theme/ThemeProvider';

type ValuesEditorProps = {
  values: string[];
  onChange: (values: string[]) => void;
};

// Thin wrapper: the heading is Your Card's; the input itself is the SAME
// shared component onboarding uses (preset tags + custom text entry), so the
// two surfaces can never drift apart again.
export function ValuesEditor({ values, onChange }: ValuesEditorProps) {
  const { colors, fonts, fs } = useTheme();

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
      <ValuesField values={values} onChange={onChange} />
    </View>
  );
}
