import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { useContestsForEvent, useEvent, useMyProfileId } from '../../../features/events/hooks';
import { formatDateRange } from '../../../features/events/format';
import { ContestCard } from '../../../features/events/ContestCard';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading: eventLoading } = useEvent(id);
  const { data: contests, isLoading: contestsLoading } = useContestsForEvent(id);
  const { data: myProfileId } = useMyProfileId();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>

        {eventLoading ? (
          <Text style={styles.status}>Loading event…</Text>
        ) : !event ? (
          <Text style={styles.status}>Event not found.</Text>
        ) : (
          <>
            <Text style={styles.name}>{event.name}</Text>
            <Text style={styles.location}>{event.location}</Text>
            <Text style={styles.dates}>{formatDateRange(event.start_date, event.end_date)}</Text>

            {event.website_url || event.facebook_url ? (
              <View style={styles.linkRow}>
                {event.website_url ? (
                  <Button
                    title="Website"
                    variant="secondary"
                    onPress={() => WebBrowser.openBrowserAsync(event.website_url as string)}
                  />
                ) : null}
                {event.facebook_url ? (
                  <Button
                    title="Facebook"
                    variant="secondary"
                    onPress={() => WebBrowser.openBrowserAsync(event.facebook_url as string)}
                  />
                ) : null}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Contests</Text>
            {contestsLoading ? (
              <Text style={styles.status}>Loading contests…</Text>
            ) : !contests || contests.length === 0 ? (
              <Text style={styles.status}>No contests listed yet.</Text>
            ) : (
              contests.map((contest) => (
                <ContestCard key={contest.id} contest={contest} myProfileId={myProfileId} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  back: {
    fontSize: fontSizes.md,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.sm,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  name: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  location: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  dates: {
    fontSize: fontSizes.md,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});
