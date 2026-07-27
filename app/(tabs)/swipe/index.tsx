import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button, Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { ContestPicker } from '../../../features/swipe/ContestPicker';
import { Deck } from '../../../features/swipe/Deck';
import {
  useDeck,
  useDeckHistory,
  useMyEntries,
  useMyFace,
  useMyProfileId,
} from '../../../features/swipe/data';

export default function SwipeScreen() {
  const { width, height } = useWindowDimensions();

  const profileIdQuery = useMyProfileId();
  const profileId = profileIdQuery.data ?? null;
  const entriesQuery = useMyEntries(profileId);
  const myFaceQuery = useMyFace(profileId);

  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);

  const entries = entriesQuery.data;
  // Default to the first entry; also recover if the selection is ever stale.
  useEffect(() => {
    if (!entries?.length) return;
    if (!selectedContestId || !entries.some((e) => e.contestId === selectedContestId)) {
      setSelectedContestId(entries[0].contestId);
    }
  }, [entries, selectedContestId]);

  const deckQuery = useDeck(selectedContestId);
  const deckCards = deckQuery.data ?? [];
  const historyQuery = useDeckHistory(deckCards.map((c) => c.profile_id));

  // Refetch the deck whenever the screen regains focus (and on contest change,
  // which is handled by the query key). Guarantees swiped cards never resurface.
  const refetchDeck = deckQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (selectedContestId) refetchDeck();
    }, [selectedContestId, refetchDeck])
  );

  if (profileIdQuery.isLoading || (profileId && entriesQuery.isLoading)) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  // No profile / no entries → send the user to the Events tab to register.
  if (!profileId || !entries || entries.length === 0) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.emptyTitle}>No contests yet</Text>
        <Text style={styles.emptyBody}>
          Enter a contest from the Events tab to start finding partners.
        </Text>
        <View style={styles.emptyAction}>
          <Button title="Browse events" onPress={() => router.push('/events')} />
        </View>
      </Screen>
    );
  }

  const cardWidth = Math.min(width - spacing.md * 2, 420);
  // Budget the card against everything else in the column (header, picker,
  // like/pass buttons, paddings, tab bar) so the buttons stay above the fold.
  const cardHeight = Math.min(Math.max(height - 340, 340), 560);

  return (
    <Screen>
      <Text style={styles.header}>Find a partner</Text>
      <ContestPicker
        entries={entries}
        selectedContestId={selectedContestId}
        onSelect={setSelectedContestId}
      />

      <View style={styles.deckHost}>
        {!selectedContestId || deckQuery.isLoading ? (
          <ActivityIndicator color={colors.brass} />
        ) : deckQuery.isError ? (
          <View style={styles.centered}>
            <Text style={styles.emptyBody}>Couldn&apos;t load the deck.</Text>
            <View style={styles.emptyAction}>
              <Button title="Retry" variant="secondary" onPress={() => refetchDeck()} />
            </View>
          </View>
        ) : (
          <Deck
            key={selectedContestId}
            cards={deckCards}
            historyByProfile={historyQuery.data ?? {}}
            contestId={selectedContestId}
            myProfileId={profileId}
            myFace={myFaceQuery.data ?? { displayName: 'You', photoUrl: null }}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            onSeeMatches={() => router.push('/matches')}
            onGoToEvents={() => router.push('/events')}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  header: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  deckHost: {
    flex: 1,
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
});
