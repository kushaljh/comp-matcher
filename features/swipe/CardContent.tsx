// The face of a deck card: photo (or the design's monogram stand-in) filling
// the whole card, with the identity block sitting in a scrim at the bottom.

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { withAlpha } from './tint';
import type { DeckCard } from './types';

type CardContentProps = {
  card: DeckCard;
  /** "Follower · novice". Null until the caller's own role has loaded. */
  roleLine: string;
};

/**
 * The design ramps the scrim in with a gradient. RN has no gradient primitive
 * here (and no gradient dependency is installed), so it's four stacked bands of
 * the same scrim colour at rising opacity.
 */
export function ScrimRamp({ color }: { color: string }) {
  return (
    <View style={styles.ramp} pointerEvents="none">
      {[0.18, 0.42, 0.7, 0.9].map((o) => (
        <View key={o} style={{ height: 13, backgroundColor: color, opacity: o }} />
      ))}
    </View>
  );
}

/** Ringed circle + oversized serif initial — the design's no-photograph card. */
export function Monogram({
  initial,
  caption,
  size = 118,
}: {
  initial: string;
  caption?: string;
  /** Disc diameter. The expanded card's 212px header needs a smaller one. */
  size?: number;
}) {
  const { colors, fonts, fs } = useTheme();
  return (
    <View style={[styles.monogram, !caption && styles.monogramFill]} pointerEvents="none">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[styles.monogramRing, { borderColor: withAlpha(colors.ink, 0.16) }]} />
        <View style={[styles.monogramHalo, { borderColor: withAlpha(colors.ink, 0.05) }]} />
        <Text
          style={{
            fontFamily: fonts.serif,
            fontSize: fs(size * 0.49),
            lineHeight: fs(size * 0.6),
            color: withAlpha(colors.ink, 0.34),
          }}
        >
          {initial}
        </Text>
      </View>
      {caption ? (
        <Text
          style={[
            styles.monogramCaption,
            { fontFamily: fonts.mono, fontSize: fs(9.5), color: withAlpha(colors.ink, 0.42) },
          ]}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export function CardContent({ card, roleLine }: CardContentProps) {
  const { colors, fonts, fs, radii } = useTheme();
  const initial = card.display_name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={[styles.container, { backgroundColor: colors.photoBg, borderRadius: radii.r }]}>
      {card.photo_url ? (
        <Image
          source={{ uri: card.photo_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Monogram initial={initial} caption="NO PHOTOGRAPH ON FILE" />
      )}

      <View style={styles.scrimWrap} pointerEvents="none">
        <ScrimRamp color={colors.scrim} />
        <View style={[styles.identity, { backgroundColor: colors.scrim }]}>
          <View style={styles.roleRow}>
            <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
            <Text
              numberOfLines={1}
              style={[styles.roleLine, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.brass }]}
            >
              {roleLine}
            </Text>
            <View style={[styles.rule, { backgroundColor: colors.cardLine }]} />
          </View>

          <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontSize: fs(35), lineHeight: fs(37), color: colors.ink }}>
            {card.display_name}
          </Text>

          {card.values.length > 0 ? (
            <View style={styles.values}>
              {card.values.slice(0, 4).map((v) => (
                <View
                  key={v}
                  style={[styles.valuePill, { backgroundColor: withAlpha(colors.ink, 0.11), borderRadius: radii.pill }]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.valueText, { fontFamily: fonts.condensedSemi, fontSize: fs(11.5), color: colors.ink }]}
                  >
                    {v}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.hintRow}>
            <View style={[styles.hintGlyph, { borderColor: withAlpha(colors.ink, 0.45) }]}>
              <Text style={{ fontFamily: fonts.mono, fontSize: fs(9), lineHeight: fs(12), color: withAlpha(colors.ink, 0.5) }}>
                ↑
              </Text>
            </View>
            <Text style={[styles.hint, { fontFamily: fonts.mono, fontSize: fs(9), color: withAlpha(colors.ink, 0.5) }]}>
              Tap the middle for the full card
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  monogram: {
    ...StyleSheet.absoluteFill,
    bottom: '44%',
    top: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  // Without the caption there is no scrim to clear, so use the whole box.
  monogramFill: {
    top: 0,
    bottom: 0,
  },
  monogramRing: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderRadius: 999,
  },
  monogramHalo: {
    position: 'absolute',
    top: -7,
    left: -7,
    right: -7,
    bottom: -7,
    borderWidth: 7,
    borderRadius: 999,
  },
  monogramCaption: {
    letterSpacing: 1.9,
    textAlign: 'center',
    maxWidth: 230,
  },
  scrimWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ramp: {
    width: '100%',
  },
  identity: {
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 20,
    gap: 9,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  diamond: {
    width: 6,
    height: 6,
    transform: [{ rotate: '45deg' }],
  },
  roleLine: {
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  rule: {
    flex: 1,
    height: 1,
    minWidth: 12,
  },
  values: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3,
  },
  valuePill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  valueText: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  hintGlyph: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
