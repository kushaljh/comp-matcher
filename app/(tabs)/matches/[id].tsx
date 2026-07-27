import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { Avatar, Chip, ContactLine } from '../../../features/matches/components';
import {
  useMatchDetail,
  useOtherContacts,
  useOtherEntry,
  useOtherHistory,
} from '../../../features/matches/hooks';

const DIVISION_LABELS: Record<string, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  follower: 'Follower',
};

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: match, isLoading, isError, error } = useMatchDetail(id);
  const otherProfileId = match?.otherProfile.id;

  const { data: entry } = useOtherEntry(otherProfileId, match?.contestId);
  const { data: contacts, isLoading: contactsLoading } = useOtherContacts(otherProfileId);
  const { data: history, isLoading: historyLoading } = useOtherHistory(otherProfileId);

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  if (isError || !match) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Match not found.'}
        </Text>
      </Screen>
    );
  }

  const { otherProfile } = match;

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Avatar uri={otherProfile.photoUrl} name={otherProfile.displayName} size={80} />
            <View style={styles.headerText}>
              <Text style={styles.name}>{otherProfile.displayName}</Text>
              <Text style={styles.subline}>
                {ROLE_LABELS[otherProfile.role] ?? otherProfile.role}
                {entry ? ` · ${DIVISION_LABELS[entry.division] ?? entry.division}` : ''}
              </Text>
            </View>
          </View>

          {otherProfile.values.length > 0 && (
            <View style={styles.chipRow}>
              {otherProfile.values.map((value) => (
                <Chip key={value} label={value} />
              ))}
            </View>
          )}

          {otherProfile.bio && <Text style={styles.bio}>{otherProfile.bio}</Text>}
        </Card>

        <Text style={styles.matchCopy}>
          You&apos;re matched for {match.contestName} at {match.eventName} — reach out and
          confirm!
        </Text>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Competition history</Text>
          {historyLoading && <ActivityIndicator color={colors.brass} />}
          {!historyLoading && (!history || history.length === 0) && (
            <Text style={styles.mutedText}>No competition history yet.</Text>
          )}
          {history?.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.historyTitle}>
                {h.contestName} @ {h.eventName} ({h.year})
              </Text>
              <Text style={styles.mutedText}>{h.placement ?? 'No placement recorded'}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          {contactsLoading && <ActivityIndicator color={colors.brass} />}
          {!contactsLoading && (!contacts || contacts.length === 0) && (
            <Text style={styles.mutedText}>No contact info shared.</Text>
          )}
          {contacts?.map((c) => (
            <ContactLine key={c.id} platform={c.platform} handle={c.handle} />
          ))}
        </Card>
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
  errorText: {
    fontSize: fontSizes.md,
    color: colors.red,
    textAlign: 'center',
  },
  headerCard: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  name: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  subline: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  bio: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  matchCopy: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.brassDark,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  historyRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTitle: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  mutedText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
