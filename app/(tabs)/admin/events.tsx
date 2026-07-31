// Event moderation: the pending queue, then the approved events whose
// contests need managing. Lifted wholesale from the old /profile/admin screen.

import { Text, StyleSheet } from 'react-native';
import { AdminGate } from '../../../features/admin/AdminGate';
import { ApprovedEventCard } from '../../../features/admin/ApprovedEventCard';
import { PendingEventCard } from '../../../features/admin/PendingEventCard';
import { useAdminApprovedEvents, useAdminPendingEvents } from '../../../features/admin/hooks';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';

export default function AdminEventsScreen() {
  const { data: pendingEvents, isLoading: pendingLoading } = useAdminPendingEvents();
  const { data: approvedEvents, isLoading: approvedLoading } = useAdminApprovedEvents();

  return (
    <AdminGate title="Events" back>
      <Text style={styles.sectionTitle}>Pending</Text>
      {pendingLoading ? (
        <Text style={styles.status}>Loading…</Text>
      ) : !pendingEvents || pendingEvents.length === 0 ? (
        <Text style={styles.status}>No pending events.</Text>
      ) : (
        pendingEvents.map((event) => <PendingEventCard key={event.id} event={event} />)
      )}

      <Text style={styles.sectionTitle}>Approved</Text>
      {approvedLoading ? (
        <Text style={styles.status}>Loading…</Text>
      ) : !approvedEvents || approvedEvents.length === 0 ? (
        <Text style={styles.status}>No approved events yet.</Text>
      ) : (
        approvedEvents.map((event) => <ApprovedEventCard key={event.id} event={event} />)
      )}
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
});
