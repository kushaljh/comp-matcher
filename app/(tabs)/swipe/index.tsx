// THE FLOOR — the product's core loop. Ticket stubs pick the contest, the deck
// fills the column, and the ✕ / ↺ / ✓ row sits under it. At >= 1080px the deck
// keeps its 452px column and a 288px rail joins it on the right.

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Screen } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { ContestStubs } from '../../../features/swipe/ContestStubs';
import { Deck } from '../../../features/swipe/Deck';
import { Bulbs } from '../../../features/swipe/Decor';
import { FloorAside } from '../../../features/swipe/FloorAside';
import {
  useContestStats,
  useDeck,
  useDeckCounts,
  useDeckHistory,
  useMyEntries,
  useMyFace,
  useMyProfileId,
} from '../../../features/swipe/data';

/** The design's wide layout; matches the shell's left-rail breakpoint. */
const WIDE = 1080;
/** What the shell's left rail takes out of the window at >= WIDE. */
const LEFT_RAIL = 236;
const ASIDE = 288;
const DECK_MAX = 452;

// ---------------------------------------------------------------------------
// The "no contest, no floor" panel — same frame as the deck's empty state.
// ---------------------------------------------------------------------------
function NoEntry() {
  const { colors, fonts, fs, radii } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        { borderRadius: radii.r, borderColor: colors.line, backgroundColor: colors.likeBg },
      ]}
    >
      <Bulbs count={7} />
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: fs(24),
          lineHeight: fs(30),
          letterSpacing: 1,
          color: colors.ink,
          textAlign: 'center',
        }}
      >
        No contest, no floor
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
        You only see dancers entered in the same contest and division as you. Enter one
        from the season and the floor fills up.
      </Text>
      <Pressable
        onPress={() => router.push('/events')}
        accessibilityRole="button"
        style={[styles.cta, { backgroundColor: colors.brass, borderRadius: radii.pill }]}
      >
        <Text
          style={[
            styles.ctaText,
            { fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.bg },
          ]}
        >
          Browse the season
        </Text>
      </Pressable>
    </View>
  );
}

function StatusLine({ children }: { children: string }) {
  const { colors, fonts, fs } = useTheme();
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.micro, { fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2 }]}>
        {children}
      </Text>
    </View>
  );
}

export default function SwipeScreen() {
  const { width } = useWindowDimensions();
  const { colors, fonts, fs } = useTheme();
  const wide = width >= WIDE;

  const profileIdQuery = useMyProfileId();
  const profileId = profileIdQuery.data ?? null;
  const entriesQuery = useMyEntries(profileId);
  const myFaceQuery = useMyFace(profileId);

  // Selection is by ENTRY, not contest: a dancer entered in one contest as both
  // roles has two stubs there, and they are two separate decks.
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // Live count for the ACTIVE stub. The other stubs read their (server) deck
  // count; this one has to follow the swipes the deck has already committed.
  const [remaining, setRemaining] = useState<number | null>(null);

  // "Find a partner" on The Season sends the entry it was pressed for; the
  // focus effect below is what acts on it.
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  // Whether this visit has already honoured the param. Without it, any later
  // refetch of `entries` would re-run the focus effect and yank the selection
  // back off a stub the dancer had since tapped themselves.
  const honouredParamRef = useRef(false);
  // The entry ids we saw last, to recognise one that has just been created.
  const seenIdsRef = useRef<Set<string>>(new Set());

  const entries = entriesQuery.data;
  useEffect(() => {
    if (!entries?.length) return;

    const ids = entries.map((e) => e.entryId);
    const seen = seenIdsRef.current;
    // Grown, and not the first load — on the first load there is nothing to
    // compare against, so every id would read as new.
    const added = seen.size ? ids.filter((id) => !seen.has(id)) : [];
    seenIdsRef.current = new Set(ids);

    // Just entered a contest — open its deck rather than leaving the dancer on
    // whichever stub happened to be selected.
    if (added.length) {
      setRemaining(null);
      setSelectedEntryId(added[0]);
      return;
    }
    // Otherwise hold the selection, falling back to the first stub when it's
    // unset or points at an entry that's gone (withdrawn).
    if (!selectedEntryId || !ids.includes(selectedEntryId)) {
      setRemaining(null);
      setSelectedEntryId(ids[0]);
    }
  }, [entries, selectedEntryId]);

  const entryIds = useMemo(() => (entries ?? []).map((e) => e.entryId), [entries]);
  const deckCounts = useDeckCounts(entryIds);

  const deckQuery = useDeck(selectedEntryId);
  const deckCards = useMemo(() => deckQuery.data ?? [], [deckQuery.data]);
  const historyQuery = useDeckHistory(deckCards.map((c) => c.profile_id));

  const selectedEntry = entries?.find((e) => e.entryId === selectedEntryId) ?? null;
  const statsQuery = useContestStats(
    selectedEntry?.contestId,
    profileId,
    selectedEntry?.role,
    wide
  );

  // Refetch the deck whenever the screen regains focus (and on entry change,
  // which is handled by the query key). Guarantees swiped cards never resurface.
  const refetchDeck = deckQuery.refetch;
  // Read through a ref so tapping a stub doesn't re-run the effect below and
  // re-apply the deep link on top of the dancer's own choice.
  const selectedRef = useRef(selectedEntryId);
  selectedRef.current = selectedEntryId;
  useFocusEffect(
    useCallback(() => {
      // Arriving via "Find a partner" selects that entry. Applied here rather
      // than on the param changing, because pressing it twice for the same
      // contest sends the same value and must still land on that deck.
      // `entries` is a dep so a param that arrives before the list loads is
      // still honoured once it does.
      if (!honouredParamRef.current && entryParam && entries?.some((e) => e.entryId === entryParam)) {
        honouredParamRef.current = true;
        setRemaining(null);
        setSelectedEntryId(entryParam);
      }
      if (selectedRef.current) refetchDeck();
    }, [entryParam, entries, refetchDeck])
  );

  // Leaving the screen re-arms the deep link for the next visit. Its own effect
  // with no deps, so the cleanup fires only on an actual blur — sharing the
  // effect above would also re-arm every time `entries` or the deck refetcher
  // changed identity, which is exactly what the guard exists to survive.
  useFocusEffect(
    useCallback(
      () => () => {
        honouredParamRef.current = false;
      },
      []
    )
  );

  const stubCounts = useMemo(() => {
    if (!selectedEntryId || remaining === null) return deckCounts;
    return { ...deckCounts, [selectedEntryId]: remaining };
  }, [deckCounts, selectedEntryId, remaining]);

  const handleSelect = useCallback((entryId: string) => {
    setRemaining(null);
    setSelectedEntryId(entryId);
  }, []);

  if (profileIdQuery.isLoading || (profileId && entriesQuery.isLoading)) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  // No profile / no entries → the design's "no contest, no floor" panel.
  if (!profileId || !entries || entries.length === 0) {
    return (
      <Screen>
        <View style={styles.column}>
          <View style={styles.deckHost}>
            <NoEntry />
          </View>
          <StatusLine>Enter a contest to open the floor</StatusLine>
        </View>
      </Screen>
    );
  }

  // The deck column: 452px, minus whatever the shell rail and the aside claim.
  const available = (wide ? width - LEFT_RAIL : width) - 32;
  const cardWidth = Math.max(
    260,
    Math.min(DECK_MAX, wide ? available - ASIDE - 24 : available)
  );

  const floor = (
    <View style={styles.column}>
      <ContestStubs
        entries={entries}
        selectedEntryId={selectedEntryId}
        counts={stubCounts}
        onSelect={handleSelect}
      />

      <View style={styles.deckHost}>
        {!selectedEntry || deckQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brass} />
          </View>
        ) : deckQuery.isError ? (
          <View style={styles.centered}>
            <Text style={{ fontFamily: fonts.body, fontSize: fs(14.5), color: colors.ink2, textAlign: 'center' }}>
              Couldn&apos;t load the deck.
            </Text>
            <Pressable onPress={() => refetchDeck()} accessibilityRole="button" style={styles.retry}>
              <Text
                style={[
                  styles.ctaText,
                  { fontFamily: fonts.condensedSemi, fontSize: fs(13), color: colors.brass },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : (
          <Deck
            key={selectedEntry.entryId}
            cards={deckCards}
            historyByProfile={historyQuery.data ?? {}}
            entryId={selectedEntry.entryId}
            contestId={selectedEntry.contestId}
            contestName={selectedEntry.contestName}
            eventName={selectedEntry.eventName}
            myProfileId={profileId}
            myRole={selectedEntry.role}
            myFace={myFaceQuery.data ?? { displayName: 'You', photoUrl: null }}
            roleLine={roleLineFor(selectedEntry.role, selectedEntry.division)}
            cardWidth={cardWidth}
            onSeeMatches={() => router.push('/matches')}
            onGoToEvents={() => router.push('/events')}
            onRemainingChange={setRemaining}
          />
        )}
      </View>
    </View>
  );

  if (!wide) return <Screen>{floor}</Screen>;

  return (
    <Screen style={styles.wideCanvas}>
      <View style={styles.wideRow}>
        <View style={styles.wideMain}>{floor}</View>
        <FloorAside asked={statsQuery.data?.asked ?? 0} paired={statsQuery.data?.paired ?? 0} />
      </View>
    </Screen>
  );
}

/**
 * get_deck only ever returns the opposite role, so the caller's own role names
 * every card in the deck. Falls back to the division alone until it loads.
 */
function roleLineFor(myRole: string | undefined, division: string | undefined): string {
  const them = myRole === 'leader' ? 'Follower' : myRole === 'follower' ? 'Leader' : null;
  if (!division) return them ?? '';
  return them ? `${them} · ${division}` : division;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  column: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  deckHost: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
  },
  // The wide layout opts out of the 520px phone canvas Screen normally imposes.
  wideCanvas: {
    maxWidth: DECK_MAX + ASIDE + 80,
  },
  wideRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    gap: 24,
  },
  wideMain: {
    flex: 1,
    minWidth: 0,
  },
  panel: {
    flex: 1,
    width: '100%',
    maxWidth: DECK_MAX,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 34,
    gap: 15,
  },
  cta: {
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 20,
  },
  ctaText: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  retry: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  statusRow: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micro: {
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
