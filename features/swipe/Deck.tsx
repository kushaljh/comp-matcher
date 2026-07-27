import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import { findMatch, insertSwipe } from './data';
import { MatchOverlay } from './MatchOverlay';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';
import type {
  CompetitionHistoryRow,
  DeckCard,
  MatchFace,
  SwipeDirection,
} from './types';

type DeckProps = {
  cards: DeckCard[];
  historyByProfile: Record<string, CompetitionHistoryRow[]>;
  contestId: string;
  myProfileId: string;
  myFace: MatchFace;
  cardWidth: number;
  cardHeight: number;
  onSeeMatches: () => void;
  onGoToEvents: () => void;
};

export function Deck({
  cards,
  historyByProfile,
  contestId,
  myProfileId,
  myFace,
  cardWidth,
  cardHeight,
  onSeeMatches,
  onGoToEvents,
}: DeckProps) {
  const [stack, setStack] = useState<DeckCard[]>(cards);
  const [error, setError] = useState<string | null>(null);
  const [matchedFace, setMatchedFace] = useState<MatchFace | null>(null);
  const topCardRef = useRef<SwipeCardHandle>(null);
  // Guards against button double-fire on a card that is still mid-fly-off.
  const busyRef = useRef(false);

  // Re-seed local state only when the query hands us a genuinely new dataset
  // (contest change / focus refetch). TanStack's structural sharing keeps the
  // reference stable when the result is unchanged, so optimistic removals made
  // between fetches are preserved.
  const prevCardsRef = useRef(cards);
  useEffect(() => {
    if (cards !== prevCardsRef.current) {
      prevCardsRef.current = cards;
      setStack(cards);
    }
  }, [cards]);

  // The one place a swipe is committed. Reached identically by a gesture flick
  // and by the LIKE/PASS buttons (both call SwipeCard's fly-off animation, which
  // resolves here once the card has left the screen).
  async function handleSwipe(card: DeckCard, direction: SwipeDirection) {
    setError(null);
    setStack((prev) => prev.filter((c) => c.profile_id !== card.profile_id));
    try {
      await insertSwipe({
        contestId,
        swiperProfileId: myProfileId,
        targetProfileId: card.profile_id,
        direction,
      });
      if (direction === 'like') {
        const matched = await findMatch({
          contestId,
          me: myProfileId,
          target: card.profile_id,
        });
        if (matched) {
          setMatchedFace({ displayName: card.display_name, photoUrl: card.photo_url });
        }
      }
    } catch {
      // Persistence failed — put the card back on top and surface the error.
      setStack((prev) => [card, ...prev]);
      setError('Could not save your swipe. Check your connection and try again.');
    } finally {
      busyRef.current = false;
    }
  }

  function handleButton(direction: SwipeDirection) {
    if (busyRef.current || stack.length === 0) return;
    busyRef.current = true;
    topCardRef.current?.swipe(direction);
  }

  const top = stack[0];
  const peek = stack[1];

  return (
    <View style={styles.container}>
      <View
        style={[styles.deckArea, { width: cardWidth, height: cardHeight + 20 }]}
      >
        {stack.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
            <Text style={styles.emptyBody}>
              No more candidates in this contest right now — check back later, or
              enter another contest.
            </Text>
            <View style={styles.emptyAction}>
              <Button title="Browse events" variant="secondary" onPress={onGoToEvents} />
            </View>
          </View>
        ) : (
          <>
            {peek ? (
              <SwipeCard
                key={peek.profile_id}
                card={peek}
                history={historyByProfile[peek.profile_id] ?? []}
                width={cardWidth}
                height={cardHeight}
                isTop={false}
                onSwiped={() => {}}
              />
            ) : null}
            {top ? (
              <SwipeCard
                key={top.profile_id}
                ref={topCardRef}
                card={top}
                history={historyByProfile[top.profile_id] ?? []}
                width={cardWidth}
                height={cardHeight}
                isTop
                onSwiped={(direction) => handleSwipe(top, direction)}
              />
            ) : null}
          </>
        )}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {stack.length > 0 ? (
        <View style={styles.buttons}>
          <Pressable
            accessibilityLabel="Pass"
            onPress={() => handleButton('pass')}
            style={({ pressed }) => [
              styles.circle,
              styles.passCircle,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.circleGlyph, styles.passGlyph]}>✗</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Like"
            onPress={() => handleButton('like')}
            style={({ pressed }) => [
              styles.circle,
              styles.likeCircle,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.circleGlyph, styles.likeGlyph]}>✓</Text>
          </Pressable>
        </View>
      ) : null}

      {matchedFace ? (
        <MatchOverlay
          me={myFace}
          them={matchedFace}
          onKeepSwiping={() => setMatchedFace(null)}
          onSeeMatches={() => {
            setMatchedFace(null);
            onSeeMatches();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  deckArea: {
    position: 'relative',
    alignSelf: 'center',
  },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSizes.sm * 1.4,
  },
  emptyAction: {
    marginTop: spacing.sm,
  },
  errorBanner: {
    backgroundColor: colors.red,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    maxWidth: 420,
  },
  errorText: {
    color: colors.textInverse,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    borderWidth: 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passCircle: {
    borderColor: colors.red,
  },
  likeCircle: {
    borderColor: colors.brass,
  },
  pressed: {
    opacity: 0.7,
  },
  circleGlyph: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.xl + 2,
  },
  passGlyph: {
    color: colors.red,
  },
  likeGlyph: {
    color: colors.brass,
  },
});
