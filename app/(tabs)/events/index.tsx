import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { useApprovedEvents } from '../../../features/events/hooks';
import { formatDateRange } from '../../../features/events/format';
import type { EventRow } from '../../../features/events/api';

export default function EventsScreen() {
  const router = useRouter();
  const { data: events, isLoading, isError, error, refetch, isRefetching } = useApprovedEvents();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Button
          title="Suggest an event"
          variant="secondary"
          onPress={() => router.push('/events/suggest')}
        />
      </View>

      {isLoading ? (
        <Text style={styles.status}>Loading events…</Text>
      ) : isError ? (
        <Text style={styles.statusError}>
          Couldn't load events: {error instanceof Error ? error.message : 'unknown error'}
        </Text>
      ) : !events || events.length === 0 ? (
        <Text style={styles.status}>No upcoming events yet.</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={events}
          keyExtractor={(item: EventRow) => item.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: EventRow }) => (
            <Pressable onPress={() => router.push(`/events/${item.id}`)}>
              <Card>
                <Text style={styles.eventName}>{item.name}</Text>
                <Text style={styles.eventLocation}>{item.location}</Text>
                <Text style={styles.eventDates}>
                  {formatDateRange(item.start_date, item.end_date)}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  statusError: {
    fontSize: fontSizes.md,
    color: colors.red,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
  },
  eventName: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  eventLocation: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  eventDates: {
    fontSize: fontSizes.sm,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
});
