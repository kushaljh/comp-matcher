// Brass "TEST" tag for seeded demo/fixture accounts, rendered next to the
// dancer's name so nobody mistakes the house band for a real partner. The flag
// itself (profiles.is_test) is derived server-side from the reserved .test
// email TLD every seeding script uses.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { withAlpha } from '../swipe/tint';

export function TestPill() {
  const { colors, fonts, fs, radii } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { borderColor: withAlpha(colors.brass, 0.75), borderRadius: radii.pill },
      ]}
    >
      <Text style={[styles.text, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.brass }]}>
        Test
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  text: {
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
});
