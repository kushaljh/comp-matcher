import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';
import { Avatar } from '../../../features/matches/components';
import { useMatches } from '../../../features/matches/hooks';
import type { MatchListItem } from '../../../features/matches/api';

type EventGroup = {
  eventId: string;
  eventName: string;
  matches: MatchListItem[];
};

function groupByEvent(matches: MatchListItem[]): EventGroup[] {
  const groups: EventGroup[] = [];
  const indexByEvent = new Map<string, number>();

  for (const match of matches) {
    const key = match.eventId || match.eventName;
    const existingIndex = indexByEvent.get(key);
    if (existingIndex === undefined) {
      indexByEvent.set(key, groups.length);
      groups.push({ eventId: match.eventId, eventName: match.eventName, matches: [match] });
    } else {
      groups[existingIndex].matches.push(match);
    }
  }

  return groups;
}

export default function MatchesScreen() {
  const router = useRouter();
  const { data: matches, isLoading, isError, error } = useMatches();

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Could not load matches.'}
        </Text>
      </Screen>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.emptyText}>
          Matches appear here when you and a partner both say yes.
        </Text>
      </Screen>
    );
  }

  const groups = groupByEvent(matches);

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groups.map((group) => (
          <View key={group.eventId || group.eventName} style={styles.group}>
            <Text style={styles.groupTitle}>{group.eventName}</Text>
            {group.matches.map((match) => (
              <Pressable
                key={match.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => router.push(`/matches/${match.id}`)}
              >
                <Avatar uri={match.otherProfile.photoUrl} name={match.otherProfile.displayName} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{match.otherProfile.displayName}</Text>
                  <Text style={styles.rowContest}>{match.contestName}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scrollContent: {
    padding: spacing.md,
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fontSizes.md,
    color: colors.red,
    textAlign: 'center',
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.creamDark,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowText: {
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  rowName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  rowContest: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
