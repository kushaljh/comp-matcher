import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import { Avatar } from '../../../features/matches/components';
import { useSignedPhotoUrls } from '../../../features/shared/photo';
import { formatRelativeTime } from '../../../features/matches/format';
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

const DIVISION_LABELS: Record<string, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

export default function MatchesScreen() {
  const router = useRouter();
  const { colors, fonts, fs, radii } = useTheme();
  const { data: matches, isLoading, isError, error } = useMatches();
  // One signing call for every avatar on the card; stored values are paths.
  const photos = useSignedPhotoUrls((matches ?? []).map((m) => m.otherProfile.photoUrl));

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
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.red, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'Could not load matches.'}
        </Text>
      </Screen>
    );
  }

  const header = (
    <View>
      <Text style={{ fontFamily: fonts.display, fontSize: fs(25), letterSpacing: 1.2, color: colors.ink }}>
        Your Dance Card
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 5 }}>
        Mutual yeses only. Contact details unlock here.
      </Text>
      <View style={styles.deco}>
        <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
        <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
        <View style={[styles.diamond, { borderWidth: 1, borderColor: colors.cardLine }]} />
        <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
      </View>
    </View>
  );

  if (!matches || matches.length === 0) {
    return (
      <Screen style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {header}
          <Text
            style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 22 }}
          >
            Matches appear here when you and a partner both say yes.
          </Text>
        </ScrollView>
      </Screen>
    );
  }

  const groups = groupByEvent(matches);

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {header}
        {groups.map((group) => (
          <View key={group.eventId || group.eventName} style={styles.group}>
            <View style={styles.groupHeaderRow}>
              <Text
                style={{
                  fontFamily: fonts.condensedSemi,
                  fontSize: fs(13),
                  letterSpacing: 1.8,
                  textTransform: 'uppercase',
                  color: colors.brass,
                }}
              >
                {group.eventName}
              </Text>
              <View style={[styles.groupRule, { backgroundColor: colors.cardLine }]} />
            </View>
            {group.matches.map((match) => (
              <Pressable
                key={match.id}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radii.rSm,
                    borderColor: pressed ? colors.brass : colors.line,
                  },
                ]}
                onPress={() => router.push(`/matches/${match.id}`)}
              >
                <Avatar
                  uri={
                    match.otherProfile.photoUrl
                      ? (photos[match.otherProfile.photoUrl] ?? null)
                      : null
                  }
                  name={match.otherProfile.displayName}
                />
                <View style={styles.rowText}>
                  <Text style={{ fontFamily: fonts.serif, fontSize: fs(19), color: colors.ink, lineHeight: fs(23) }}>
                    {match.otherProfile.displayName}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.condensed,
                      fontSize: fs(12.5),
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: colors.ink2,
                      marginTop: 2,
                    }}
                  >
                    {match.contestName} · {match.division ? DIVISION_LABELS[match.division] ?? match.division : '—'}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: fs(10), letterSpacing: 1, color: colors.brass }}>
                    {match.firstHandle ?? ''}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: fs(8.5),
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      color: colors.ink2,
                      marginTop: 3,
                    }}
                  >
                    {formatRelativeTime(match.createdAt)}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.mono, fontSize: fs(13), color: colors.ink2 }}>→</Text>
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
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  deco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13,
    width: 240,
  },
  decoRule: {
    flex: 1,
    height: 1,
  },
  diamond: {
    width: 5,
    height: 5,
    transform: [{ rotate: '45deg' }],
  },
  group: {
    marginTop: 22,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  groupRule: {
    flex: 1,
    height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
});
