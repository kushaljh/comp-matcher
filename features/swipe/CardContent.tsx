import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../theme/tokens';
import { Chip } from './Chip';
import type { CompetitionHistoryRow, DeckCard } from './types';

type CardContentProps = {
  card: DeckCard;
  history: CompetitionHistoryRow[];
};

function formatHistory(row: CompetitionHistoryRow): string {
  const place = row.placement ? ` · ${row.placement}` : '';
  return `${row.year} ${row.event_name} — ${row.contest_name}${place}`;
}

// Purely presentational face of a card. Kept free of animation/gesture concerns
// so both the interactive stack card and (potentially) previews can reuse it.
export function CardContent({ card, history }: CardContentProps) {
  const initial = card.display_name.trim().charAt(0).toUpperCase() || '?';
  const topHistory = history.slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={styles.photoWrap}>
        {card.photo_url ? (
          <Image
            source={{ uri: card.photo_url }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoInitial}>{initial}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {card.display_name}
          </Text>
          <Chip label={card.division} variant="division" />
        </View>

        {card.values.length > 0 ? (
          <View style={styles.valuesRow}>
            {card.values.map((v) => (
              <Chip key={v} label={v} />
            ))}
          </View>
        ) : null}

        {card.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {card.bio}
          </Text>
        ) : null}

        {topHistory.length > 0 ? (
          <View style={styles.historyBlock}>
            <Text style={styles.historyHeading}>Competition history</Text>
            {topHistory.map((row) => (
              <Text key={row.id} style={styles.historyRow} numberOfLines={1}>
                {formatHistory(row)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoWrap: {
    flex: 1,
    backgroundColor: colors.creamDark,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  photoInitial: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.brass,
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  valuesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  bio: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: fontSizes.sm * 1.4,
  },
  historyBlock: {
    gap: 2,
  },
  historyHeading: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  historyRow: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
});
