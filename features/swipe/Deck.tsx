import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useSignedPhotoUrls } from '../shared/photo';
import { useClips, useGalleryPhotos } from '../shared/media';
import { suppressMatchBanner } from '../live/matchLive';
import { deckKey, deleteOwnPass, findMatch, insertSwipe, statsKey } from './data';
import { Bulbs } from './Decor';
import { ExpandedCard } from './ExpandedCard';
import { MatchOverlay } from './MatchOverlay';
import { SwipeCard, type SwipeCardHandle } from './SwipeCard';
import { withAlpha } from './tint';
import type {
  CompetitionHistoryRow,
  DanceRole,
  DeckCard,
  MatchFace,
  SwipeDirection,
  UndoEntry,
} from './types';

type DeckProps = {
  cards: DeckCard[];
  historyByProfile: Record<string, CompetitionHistoryRow[]>;
  /** The caller's entry this deck belongs to — identifies the deck's cache. */
  entryId: string;
  contestId: string;
  contestName: string;
  eventName: string;
  myProfileId: string;
  /** The role the caller is competing as in THIS entry. */
  myRole: DanceRole;
  myFace: MatchFace;
  /** "Follower · novice" for every card in this deck, or just the division. */
  roleLine: string;
  cardWidth: number;
  onSeeMatches: () => void;
  onGoToEvents: () => void;
  onRemainingChange: (remaining: number) => void;
};

const LIKE_UNDO_NOTICE =
  "That ask is already on their card — retract it from your dance card.";
const NOTICE_MS = 3600;

export function Deck({
  cards,
  historyByProfile,
  entryId,
  contestId,
  contestName,
  eventName,
  myProfileId,
  myRole,
  myFace,
  roleLine,
  cardWidth,
  onSeeMatches,
  onGoToEvents,
  onRemainingChange,
}: DeckProps) {
  const { colors, fonts, fs, radii } = useTheme();
  const queryClient = useQueryClient();

  // One signing round-trip for the whole stack, not one per card. Keyed off the
  // full `cards` list rather than `stack` so a swipe doesn't re-key the query
  // and re-sign everything that's left.
  // Extra photos and clips for every candidate in the deck, batched the same
  // way (one query each, not one per card).
  const galleryByProfile = useGalleryPhotos(cards.map((c) => c.profile_id));
  const clipsByProfile = useClips(cards.map((c) => c.profile_id));

  // Primary photos AND every gallery photo go through one signing call.
  const photoUrls = useSignedPhotoUrls([
    ...cards.map((c) => c.photo_url),
    ...Object.values(galleryByProfile).flat().map((g) => g.path),
  ]);

  const [stack, setStack] = useState<DeckCard[]>(cards);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Which of the top card's photos is showing. Reset whenever the top card
  // changes, or the next dancer would open on photo 3.
  const [photoIndex, setPhotoIndex] = useState(0);
  const [matchedFace, setMatchedFace] = useState<MatchFace | null>(null);
  const topCardRef = useRef<SwipeCardHandle>(null);

  // Guards against button double-fire on a card that is still mid-fly-off.
  const busyRef = useRef(false);
  // Failsafe timer that releases busyRef even if a swipe never resolves, so the
  // buttons can never be permanently bricked by a stuck animation.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearWatchdog() {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }
  useEffect(
    () => () => {
      clearWatchdog();
      if (noticeRef.current) clearTimeout(noticeRef.current);
    },
    []
  );

  const showNotice = useCallback((text: string) => {
    if (noticeRef.current) clearTimeout(noticeRef.current);
    setNotice(text);
    noticeRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

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

  useEffect(() => {
    onRemainingChange(stack.length);
  }, [stack.length, onRemainingChange]);

  // The one place a swipe is committed. Reached identically by a gesture flick,
  // the ✕ / ✓ buttons and the keyboard shortcuts (all three call SwipeCard's
  // fly-off, which resolves here once the card has left the screen).
  async function handleSwipe(card: DeckCard, direction: SwipeDirection) {
    setError(null);
    setNotice(null);
    setExpanded(false);
    setStack((prev) => prev.filter((c) => c.profile_id !== card.profile_id));
    setUndoStack((prev) => [...prev, { card, direction }]);
    try {
      await insertSwipe({
        contestId,
        swiperProfileId: myProfileId,
        swiperRole: myRole,
        targetProfileId: card.profile_id,
        direction,
      });
      queryClient.invalidateQueries({ queryKey: statsKey(contestId, myProfileId, myRole) });
      // The Season counts the same pool this deck deals from, so a swipe has
      // just made that number one smaller. Whole prefix — a like can create a
      // match, which the other role's count excludes too.
      queryClient.invalidateQueries({ queryKey: ['entries', 'pool'] });
      if (direction === 'like') {
        const matched = await findMatch({
          contestId,
          me: myProfileId,
          myRole,
          target: card.profile_id,
        });
        if (matched) {
          // We show the full celebration ourselves — keep the global realtime
          // banner from doubling up for this pair. The role is part of the key:
          // the same two dancers can pair twice in one contest, once per role,
          // and suppressing one must not swallow the other's banner.
          suppressMatchBanner(`${contestId}:${card.profile_id}:${myRole}`);
          setMatchedFace({ displayName: card.display_name, photoUrl: card.photo_url });
        }
      }
    } catch {
      // Persistence failed — put the card back on top and surface the error.
      setStack((prev) => [card, ...prev]);
      setUndoStack((prev) => prev.slice(0, -1));
      setError('Could not save your swipe. Check your connection and try again.');
    } finally {
      busyRef.current = false;
      clearWatchdog();
    }
  }

  const commit = useCallback((direction: SwipeDirection) => {
    if (busyRef.current || stack.length === 0) return;
    busyRef.current = true;
    // Arm the failsafe: the normal path clears this in handleSwipe's finally.
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      busyRef.current = false;
      watchdogRef.current = null;
    }, 2000);
    setExpanded(false);
    topCardRef.current?.swipe(direction);
  }, [stack.length]);

  // Take back a pass. The DB lets us delete our own pass rows and nothing else,
  // so a like gets the design's notice instead of a delete.
  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last || busyRef.current) return;
    if (last.direction === 'like') {
      showNotice(LIKE_UNDO_NOTICE);
      return;
    }
    // Pop first: a double-tap can then never delete or reinsert twice.
    setUndoStack((prev) => prev.slice(0, -1));
    setExpanded(false);
    setNotice(null);
    setError(null);
    setStack((prev) =>
      prev.some((c) => c.profile_id === last.card.profile_id) ? prev : [last.card, ...prev]
    );
    try {
      await deleteOwnPass({
        contestId,
        swiperProfileId: myProfileId,
        swiperRole: myRole,
        targetProfileId: last.card.profile_id,
      });
      // Mark the deck stale without pulling a fresh page right now: get_deck has
      // no ORDER BY, so an immediate refetch could drop the recovered card back
      // into the middle of the pile. The next screen focus reconciles.
      queryClient.invalidateQueries({ queryKey: deckKey(entryId), refetchType: 'none' });
    } catch {
      setStack((prev) => prev.filter((c) => c.profile_id !== last.card.profile_id));
      setUndoStack((prev) => [...prev, last]);
      setError('Could not take back that pass. Check your connection and try again.');
    }
  }, [undoStack, entryId, contestId, myProfileId, myRole, queryClient, showNotice]);

  const top = stack[0];

  // Primary photo first, then the extras — the order the segments count in.
  const topPhotoPaths = top
    ? [top.photo_url, ...(galleryByProfile[top.profile_id] ?? []).map((g) => g.path)].filter(
        (p): p is string => !!p
      )
    : [];
  const topPhotoCount = Math.max(topPhotoPaths.length, 1);
  const safeIndex = Math.min(photoIndex, topPhotoPaths.length - 1);
  const topPhotoUri = topPhotoPaths[safeIndex] ? (photoUrls[topPhotoPaths[safeIndex]] ?? null) : null;

  // Reset paging when the top card changes — otherwise the next dancer opens on
  // whatever photo index the previous one was left on.
  const topProfileId = top?.profile_id;
  useEffect(() => {
    setPhotoIndex(0);
  }, [topProfileId]);

  // Wrap around rather than dead-ending at either edge.
  const pagePhoto = useCallback(
    (delta: number) => {
      if (topPhotoCount < 2) return;
      setPhotoIndex((i) => (i + delta + topPhotoCount) % topPhotoCount);
    },
    [topPhotoCount]
  );
  const lastAction = undoStack[undoStack.length - 1];
  const canUndo = !!lastAction && lastAction.direction === 'pass';

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (web only). Inert while a text field has focus, and the
  // match celebration swallows everything but Escape.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (matchedFace) {
        if (e.key === 'Escape') setMatchedFace(null);
        return;
      }
      if (expanded && (e.key === 'Escape' || e.key === 'ArrowDown')) {
        e.preventDefault();
        setExpanded(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        commit('pass');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        commit('like');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (stack.length > 0) setExpanded(true);
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit, undo, expanded, matchedFace, stack.length]);

  const statusLine = top
    ? `${stack.length} of ${Math.max(cards.length, stack.length)} still on the floor · drag or use the buttons`
    : 'Floor cleared';

  return (
    <View style={styles.column}>
      <View style={[styles.deckArea, { width: cardWidth }]}>
        {stack.length > 2 ? (
          <View
            style={[
              styles.peek,
              styles.peekDeep,
              { backgroundColor: colors.surface, borderRadius: radii.r, borderColor: colors.line },
            ]}
          />
        ) : null}
        {stack.length > 1 ? (
          <View
            style={[
              styles.peek,
              styles.peekNear,
              { backgroundColor: colors.photoBg, borderRadius: radii.r, borderColor: colors.line },
            ]}
          />
        ) : null}

        {top ? (
          <SwipeCard
            key={top.profile_id}
            ref={topCardRef}
            card={top}
            roleLine={roleLine}
            photoUri={topPhotoUri}
            photoCount={topPhotoCount}
            photoIndex={safeIndex < 0 ? 0 : safeIndex}
            width={cardWidth}
            onSwiped={(direction) => handleSwipe(top, direction)}
            onTapMiddle={() => setExpanded(true)}
            onPagePhoto={pagePhoto}
          />
        ) : (
          <View
            style={[
              styles.empty,
              { borderRadius: radii.r, borderColor: colors.line, backgroundColor: colors.likeBg },
            ]}
          >
            <Bulbs count={7} />
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: fs(26),
                lineHeight: fs(32),
                letterSpacing: 1.1,
                color: colors.ink,
                textAlign: 'center',
              }}
            >
              That&apos;s the whole floor
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: fs(14.5),
                lineHeight: fs(23),
                color: colors.ink2,
                textAlign: 'center',
                maxWidth: 310,
              }}
            >
              Everyone entered in {contestName} has had their turn. New entries land here
              as they register.
            </Text>
            <View style={styles.emptyActions}>
              <Pressable
                onPress={undo}
                disabled={!canUndo}
                accessibilityRole="button"
                style={[
                  styles.emptyButton,
                  {
                    borderRadius: radii.rSm,
                    borderColor: canUndo ? colors.brass : colors.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.emptyButtonText,
                    {
                      fontFamily: fonts.condensedSemi,
                      fontSize: fs(13),
                      color: canUndo ? colors.brass : colors.ink2,
                    },
                  ]}
                >
                  Take back a pass
                </Text>
              </Pressable>
              <Pressable
                onPress={onGoToEvents}
                accessibilityRole="button"
                style={[styles.emptyButton, { borderRadius: radii.rSm, borderColor: colors.line }]}
              >
                <Text
                  style={[
                    styles.emptyButtonText,
                    { fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.ink },
                  ]}
                >
                  Another program
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {top && expanded ? (
          <ExpandedCard
            card={top}
            history={historyByProfile[top.profile_id] ?? []}
            roleLine={roleLine}
            photoUri={top.photo_url ? (photoUrls[top.photo_url] ?? null) : null}
            galleryUris={(galleryByProfile[top.profile_id] ?? []).map(
              (g) => photoUrls[g.path] ?? null
            )}
            clips={clipsByProfile[top.profile_id] ?? []}
            onClose={() => setExpanded(false)}
          />
        ) : null}
      </View>

      {error ? (
        <View style={[styles.errorBanner, { borderColor: colors.red, borderRadius: radii.rSm }]}>
          <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.red, textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Sit this one out"
          accessibilityRole="button"
          onPress={() => commit('pass')}
          style={({ pressed }) => [
            styles.halo,
            { backgroundColor: withAlpha(colors.red, 0.1) },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.circle, styles.circleLg, { borderColor: colors.red }]}>
            <Text style={{ fontFamily: fonts.body, fontSize: fs(21), lineHeight: fs(26), color: colors.red }}>
              ✕
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityLabel="Take back a pass"
          accessibilityRole="button"
          onPress={undo}
          disabled={!canUndo}
          style={({ pressed }) => [pressed && canUndo && styles.pressed]}
        >
          <View
            style={[
              styles.circle,
              styles.circleSm,
              { borderColor: canUndo ? colors.line : withAlpha(colors.brass, 0.12) },
            ]}
          >
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: fs(16),
                lineHeight: fs(20),
                color: canUndo ? colors.ink2 : withAlpha(colors.ink2, 0.35),
              }}
            >
              ↺
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityLabel="Ask 'em to dance"
          accessibilityRole="button"
          onPress={() => commit('like')}
          style={({ pressed }) => [
            styles.halo,
            { backgroundColor: colors.likeBg },
            pressed && styles.pressed,
          ]}
        >
          <View
            style={[
              styles.circle,
              styles.circleLg,
              { borderColor: colors.brass, backgroundColor: colors.likeBg },
            ]}
          >
            <Text style={{ fontFamily: fonts.body, fontSize: fs(21), lineHeight: fs(26), color: colors.brass }}>
              ✓
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        {notice ? (
          <View
            style={[
              styles.noticePill,
              { borderColor: colors.line, backgroundColor: colors.likeBg, borderRadius: radii.pill },
            ]}
          >
            <Text
              style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9.5), color: colors.brass }]}
            >
              {notice}
            </Text>
          </View>
        ) : (
          <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
            {statusLine}
          </Text>
        )}
      </View>

      {matchedFace ? (
        <MatchOverlay
          me={myFace}
          them={matchedFace}
          contestName={contestName}
          eventName={eventName}
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
  column: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    gap: 12,
  },
  deckArea: {
    position: 'relative',
    flex: 1,
    minHeight: 280,
    maxHeight: 566,
    alignSelf: 'center',
  },
  peek: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
  },
  peekNear: {
    transform: [{ scale: 0.95 }, { translateY: 13 }],
  },
  peekDeep: {
    opacity: 0.34,
    transform: [{ scale: 0.9 }, { translateY: 26 }],
  },
  empty: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 34,
    gap: 16,
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  emptyButton: {
    borderWidth: 1,
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 20,
  },
  emptyButtonText: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  errorBanner: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    maxWidth: 420,
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    borderRadius: 999,
    padding: 6,
  },
  circle: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLg: {
    width: 64,
    height: 64,
  },
  circleSm: {
    width: 46,
    height: 46,
  },
  pressed: {
    opacity: 0.7,
  },
  statusRow: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  noticePill: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 380,
  },
  micro: {
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
