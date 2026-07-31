import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Screen } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';
import { useAdminApprovedEvents, useAdminPendingEvents, useIsAdmin } from '../../../features/admin/hooks';
import { PendingEventCard } from '../../../features/admin/PendingEventCard';
import { ApprovedEventCard } from '../../../features/admin/ApprovedEventCard';
import { DancerRoster } from '../../../features/admin/DancerRoster';

// Guard: RLS is the REAL gate (a non-admin's queries below would just come
// back empty/rejected regardless of this screen), this is purely UX so a
// non-admin doesn't see a broken/empty admin screen.
export default function AdminScreen() {
  const router = useRouter();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>

        {adminLoading ? (
          <ActivityIndicator color={colors.brass} />
        ) : !isAdmin ? (
          <Text style={styles.notAuthorized}>Not authorized.</Text>
        ) : (
          <AdminPanel />
        )}
      </ScrollView>
    </Screen>
  );
}

function AdminPanel() {
  const { data: pendingEvents, isLoading: pendingLoading } = useAdminPendingEvents();
  const { data: approvedEvents, isLoading: approvedLoading } = useAdminApprovedEvents();

  return (
    <>
      <Text style={styles.title}>Admin</Text>

      <Text style={styles.sectionTitle}>Pending events</Text>
      {pendingLoading ? (
        <Text style={styles.status}>Loading…</Text>
      ) : !pendingEvents || pendingEvents.length === 0 ? (
        <Text style={styles.status}>No pending events.</Text>
      ) : (
        pendingEvents.map((event) => <PendingEventCard key={event.id} event={event} />)
      )}

      <Text style={styles.sectionTitle}>Approved events</Text>
      {approvedLoading ? (
        <Text style={styles.status}>Loading…</Text>
      ) : !approvedEvents || approvedEvents.length === 0 ? (
        <Text style={styles.status}>No approved events yet.</Text>
      ) : (
        approvedEvents.map((event) => <ApprovedEventCard key={event.id} event={event} />)
      )}

      <Text style={styles.sectionTitle}>Dancers</Text>
      <DancerRoster />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  back: {
    fontSize: fontSizes.md,
    color: colors.brassDark,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  notAuthorized: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
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
