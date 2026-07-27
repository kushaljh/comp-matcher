// The wide-layout right rail: keyboard shortcuts, this program's tally, and the
// house rules. Only mounted at >= 1080px, where the keys it advertises exist.

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

const SHORTCUTS: [string, string][] = [
  ['→', "Ask 'em to dance"],
  ['←', 'Sit this one out'],
  ['↑', 'Open the full card'],
  ['Z', 'Take back a pass'],
];

type FloorAsideProps = {
  asked: number;
  paired: number;
};

function Rule() {
  const { colors } = useTheme();
  return <View style={[styles.rule, { backgroundColor: colors.cardLine }]} />;
}

function MicroLabel({ children }: { children: string }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
      {children}
    </Text>
  );
}

export function FloorAside({ asked, paired }: FloorAsideProps) {
  const { colors, fonts, fs } = useTheme();

  return (
    <ScrollView style={[styles.aside, { borderLeftColor: colors.line }]} contentContainerStyle={styles.content}>
      <View style={styles.block}>
        <MicroLabel>Work the floor fast</MicroLabel>
        {SHORTCUTS.map(([key, label]) => (
          <View key={key} style={styles.shortcut}>
            <View style={[styles.kbd, { borderColor: colors.line, backgroundColor: colors.fieldBg }]}>
              <Text style={{ fontFamily: fonts.mono, fontSize: fs(10), lineHeight: fs(14), color: colors.brass }}>
                {key}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>{label}</Text>
          </View>
        ))}
      </View>

      <Rule />

      <View style={styles.block}>
        <MicroLabel>This program</MicroLabel>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={{ fontFamily: fonts.deco, fontSize: fs(32), lineHeight: fs(36), color: colors.brass }}>
              {asked}
            </Text>
            <Text style={[styles.statLabel, { fontFamily: fonts.condensed, fontSize: fs(11), color: colors.ink2 }]}>
              Asked
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={{ fontFamily: fonts.deco, fontSize: fs(32), lineHeight: fs(36), color: colors.ink }}>
              {paired}
            </Text>
            <Text style={[styles.statLabel, { fontFamily: fonts.condensed, fontSize: fs(11), color: colors.ink2 }]}>
              Paired
            </Text>
          </View>
        </View>
      </View>

      <Rule />

      <View style={styles.blockTight}>
        <MicroLabel>House rules</MicroLabel>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(13), lineHeight: fs(21), color: colors.ink2 }}>
          You only appear to dancers entered in the same contest and division. Nobody sees
          whether you passed — a pairing shows up on both dance cards only when it&apos;s
          mutual.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  aside: {
    width: 288,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: 1,
  },
  content: {
    paddingVertical: 26,
    paddingLeft: 20,
    paddingRight: 8,
    gap: 24,
  },
  block: {
    gap: 11,
  },
  blockTight: {
    gap: 8,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kbd: {
    minWidth: 26,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 14,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  micro: {
    letterSpacing: 1.9,
    textTransform: 'uppercase',
  },
  rule: {
    height: 1,
    width: '100%',
  },
});
