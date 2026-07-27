import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import { formatDateRange } from '../events/format';
import type { EventRow } from './api';
import { useApproveEvent, useRejectEvent } from './hooks';
import { ScanContestsSection } from './ScanContests';

// Inline-confirm pattern for reject (matches features/events/ContestCard.tsx —
// Alert.alert is a no-op on web, so destructive actions confirm via a local
// toggled state + inline Confirm/Cancel row rather than a native alert).
export function PendingEventCard({ event }: { event: EventRow }) {
  const approveMutation = useApproveEvent();
  const rejectMutation = useRejectEvent();

  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    try {
      await approveMutation.mutateAsync(event.id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not approve this event.');
    }
  }

  async function handleReject() {
    setError(null);
    try {
      await rejectMutation.mutateAsync(event.id);
      setConfirmingReject(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not reject this event.');
      setConfirmingReject(false);
    }
  }

  return (
    <Card style={styles.card}>
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

      {event.website_url ? <ScanContestsSection websiteUrl={event.website_url} /> : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.buttonRow}>
        <Button title="Approve" onPress={handleApprove} loading={approveMutation.isPending} />
        {confirmingReject ? (
          <>
            <Text style={styles.confirmText}>Reject (delete) this event?</Text>
            <Button
              title="Confirm reject"
              variant="destructive"
              onPress={handleReject}
              loading={rejectMutation.isPending}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setConfirmingReject(false)} />
          </>
        ) : (
          <Button title="Reject" variant="destructive" onPress={() => setConfirmingReject(true)} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  name: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  location: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  dates: {
    fontSize: fontSizes.sm,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  confirmText: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.xs,
    marginTop: spacing.sm,
  },
});
