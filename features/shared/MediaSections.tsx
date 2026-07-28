// The three media regions the redesign draws: the photo segment bar over a
// card, the "Photographs · N" thumbnail row, and the "Floor footage" clip grid.
//
// Shared by the expanded deck card and the partner dossier so the two can't
// drift. Every value comes from useTheme() — the prototype's hexes are the same
// palette, but hardcoding them here would fork the theme.

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { clipThumbnail, CLIP_PLATFORM_LABELS, type ClipPlatform } from '../profile/clipValidation';
import type { Clip } from './media';

// ---------------------------------------------------------------------------
// Segment bar — one tick per photo, brightest on the current one. Sits over the
// card photo; SwipeCard already reserves the left/right tap-zones that page it.
// ---------------------------------------------------------------------------
export function PhotoSegments({ count, index }: { count: number; index: number }) {
  const { colors } = useTheme();
  // A single photo needs no progress indicator.
  if (count < 2) return null;
  return (
    <View style={styles.segments} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { backgroundColor: colors.ink, opacity: i === index ? 0.92 : 0.28 },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// "Photographs · N" — a row of tappable thumbnails.
// ---------------------------------------------------------------------------
export function GalleryRow({
  uris,
  activeIndex,
  onSelect,
}: {
  uris: (string | null)[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const { colors, fonts, fs } = useTheme();
  if (uris.length < 2) return null;

  return (
    <View style={styles.block}>
      <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
        Photographs · {uris.length}
      </Text>
      <View style={styles.thumbRow}>
        {uris.map((uri, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Photo ${i + 1}`}
            onPress={() => onSelect(i)}
            style={[
              styles.thumb,
              {
                backgroundColor: colors.photoBg,
                borderColor: i === activeIndex ? colors.brass : colors.line,
              },
            ]}
          >
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// "Floor footage" — a 2-column grid of clip tiles.
//
// Only YouTube gives a free static thumbnail. Instagram and TikTok tiles fall
// back to the design's hatch-and-play-glyph placeholder with a platform label,
// so they read as deliberate rather than broken. Tapping opens the video
// externally (expo-web-browser) rather than playing inline — no WebView
// dependency, and no autoplaying video inside a swipeable deck.
// ---------------------------------------------------------------------------
export function ClipGrid({ clips }: { clips: Clip[] }) {
  const { colors, fonts, fs, radii } = useTheme();
  if (clips.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
        Floor footage
      </Text>
      <View style={styles.clipGrid}>
        {clips.map((clip) => {
          const thumb = clipThumbnail({
            platform: clip.platform as ClipPlatform,
            video_id: clip.video_id,
          });
          return (
            <Pressable
              key={clip.id}
              accessibilityRole="button"
              accessibilityLabel={`Play ${CLIP_PLATFORM_LABELS[clip.platform as ClipPlatform]} clip`}
              onPress={() => WebBrowser.openBrowserAsync(clip.url)}
              style={[styles.clipTile, { backgroundColor: colors.photoBg, borderColor: colors.line }]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              <View style={[styles.playGlyph, { borderColor: colors.ink, borderRadius: radii.pill }]}>
                <Text style={{ fontSize: fs(11), color: colors.ink }}>▶</Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.clipLabel,
                  { fontFamily: fonts.mono, fontSize: fs(8.5), color: colors.ink2 },
                ]}
              >
                {CLIP_PLATFORM_LABELS[clip.platform as ClipPlatform]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 5,
    zIndex: 3,
  },
  segment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  block: {
    gap: 9,
  },
  micro: {
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 7,
  },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  clipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clipTile: {
    // 16:10, two per row with the 8px gap between them.
    flexBasis: '48%',
    flexGrow: 1,
    aspectRatio: 16 / 10,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 8,
  },
  playGlyph: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -17,
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  clipLabel: {
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
