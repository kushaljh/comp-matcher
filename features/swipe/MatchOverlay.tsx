// "You've got a partner" — the celebration that fires the moment a like comes
// back mutual. Presented as a modal so it sits above the deck and the tab bar.

import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Bulbs, Confetti } from './Decor';
import type { MatchFace } from './types';

type MatchOverlayProps = {
  me: MatchFace;
  them: MatchFace;
  contestName: string;
  eventName: string;
  onKeepSwiping: () => void;
  onSeeMatches: () => void;
};

function Roundel({ face, label }: { face: MatchFace; label: string }) {
  const { colors, fonts, fs } = useTheme();
  const initial = face.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={styles.roundelCol}>
      <View style={[styles.roundel, { borderColor: colors.brass, backgroundColor: colors.surface2 }]}>
        {face.photoUrl ? (
          <Image source={{ uri: face.photoUrl }} style={styles.roundelPhoto} contentFit="cover" />
        ) : (
          <Text style={{ fontFamily: fonts.serif, fontSize: fs(31), lineHeight: fs(38), color: colors.brass }}>
            {initial}
          </Text>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.roundelLabel, { fontFamily: fonts.condensed, fontSize: fs(12), color: colors.ink }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function MatchOverlay({
  me,
  them,
  contestName,
  eventName,
  onKeepSwiping,
  onSeeMatches,
}: MatchOverlayProps) {
  const { colors, fonts, fs, radii } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeepSwiping}>
      <View style={styles.backdrop}>
        <Confetti />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderRadius: radii.r, borderColor: colors.brass },
          ]}
        >
          <Bulbs count={9} size={7} />

          <View style={styles.headline}>
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: fs(31),
                lineHeight: fs(38),
                letterSpacing: 1.2,
                color: colors.brass,
                textAlign: 'center',
              }}
            >
              You&apos;ve got a partner
            </Text>
            <Text
              style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}
            >
              {contestName} · {eventName}
            </Text>
          </View>

          <View style={styles.faces}>
            <Roundel face={me} label="You" />
            <Text style={{ fontFamily: fonts.serifItalic, fontSize: fs(24), color: colors.ink2 }}>&amp;</Text>
            <Roundel face={them} label={them.displayName} />
          </View>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: fs(14.5),
              lineHeight: fs(23),
              color: colors.ink2,
              textAlign: 'center',
              maxWidth: 330,
            }}
          >
            Contact details are unsealed on both dance cards. Somebody has to message
            first — might as well be you.
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onSeeMatches}
              accessibilityRole="button"
              style={[styles.cta, { backgroundColor: colors.brass, borderRadius: radii.pill }]}
            >
              <Text
                style={[styles.ctaText, { fontFamily: fonts.condensedSemi, fontSize: fs(14), color: colors.bg }]}
              >
                Open the dance card
              </Text>
            </Pressable>
            <Pressable
              onPress={onKeepSwiping}
              accessibilityRole="button"
              style={[styles.ctaOutline, { borderColor: colors.line, borderRadius: radii.pill }]}
            >
              <Text
                style={[styles.ctaText, { fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.ink2 }]}
              >
                Back to the floor
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,11,15,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  sheet: {
    width: '100%',
    maxWidth: 452,
    borderWidth: 1,
    paddingTop: 30,
    paddingBottom: 26,
    paddingHorizontal: 26,
    gap: 18,
    alignItems: 'center',
  },
  headline: {
    alignItems: 'center',
    gap: 9,
  },
  micro: {
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  roundelCol: {
    alignItems: 'center',
    gap: 7,
    maxWidth: 130,
  },
  roundel: {
    width: 82,
    height: 82,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  roundelPhoto: {
    width: '100%',
    height: '100%',
  },
  roundelLabel: {
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  actions: {
    width: '100%',
    gap: 9,
  },
  cta: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaOutline: {
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  ctaText: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
