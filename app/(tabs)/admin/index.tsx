// Admin landing: the state of the house, then a way into each area.
//
// The counts aren't decoration — they're the reason to open this tab at all.
// "2 pending" on the Events row is what tells you there's work, without you
// having to go and look.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '../../../features/admin/AdminGate';
import { useAdminOverview } from '../../../features/admin/hooks';
import { Card } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Pressable around a View rather than <Link> wrapping two <Text>s: on
// react-native-web a Link renders as an <a>, and Texts inside it lay out
// INLINE, so the label and its detail ran together on one line ("EventsNothing
// waiting"). A View gives them back their block layout on every platform.
function MenuRow({ href, label, detail }: { href: string; label: string; detail: string }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="link" style={styles.menuRow}>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuDetail}>{detail}</Text>
    </Pressable>
  );
}

export default function AdminHomeScreen() {
  const { data: overview, isLoading } = useAdminOverview();

  const pending = overview?.pending_events ?? 0;
  const outstanding = overview?.invites_outstanding ?? 0;
  const newFeedback = overview?.feedback_new ?? 0;

  return (
    <AdminGate title="Admin">
      <Card style={styles.statsCard}>
        {isLoading || !overview ? (
          <Text style={styles.status}>Counting…</Text>
        ) : (
          <View style={styles.statsGrid}>
            <Stat value={overview.dancers} label="Dancers" />
            <Stat value={overview.joined_last_7d} label="Joined this week" />
            <Stat value={overview.suspended} label="Suspended" />
            <Stat value={overview.can_invite} label="Can invite" />
            <Stat value={overview.invites_outstanding} label="Codes out" />
            <Stat value={overview.invites_claimed} label="Codes claimed" />
          </View>
        )}
      </Card>

      <MenuRow
        href="/admin/events"
        label="Events"
        detail={pending === 0 ? 'Nothing waiting' : `${pending} waiting for review`}
      />
      <MenuRow
        href="/admin/dancers"
        label="Dancers"
        detail="Suspend, reinstate, grant invites"
      />
      <MenuRow
        href="/admin/invites"
        label="Invites"
        detail={outstanding === 0 ? 'No codes outstanding' : `${outstanding} outstanding`}
      />
      <MenuRow
        href="/admin/feedback"
        label="Feedback"
        detail={newFeedback === 0 ? 'Nothing new' : `${newFeedback} new`}
      />
      <MenuRow href="/admin/log" label="Admin log" detail="Who did what, and why" />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    marginBottom: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  stat: {
    minWidth: '33%',
    flexGrow: 1,
  },
  statValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  menuRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  menuLabel: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  menuDetail: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
});
