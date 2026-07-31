// The admin log: every suspension, reinstatement, invite grant, admin invite
// deletion and feedback resolution, newest first.
//
// Append-only by construction — admin_actions has no insert/update/delete
// policy, so every row here was written by a SECURITY DEFINER function and
// none of them can be edited or removed through the API, including by the
// admin who caused them.

import { StyleSheet, Text, View } from 'react-native';
import { AdminGate } from '../../../features/admin/AdminGate';
import { useAdminActions } from '../../../features/admin/hooks';
import { Card } from '../../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../../theme/tokens';

const ACTION_LABELS: Record<string, string> = {
  suspend: 'Suspended',
  reinstate: 'Reinstated',
  set_invite_quota: 'Set invites for',
  delete_invite: 'Deleted invite',
  resolve_feedback: 'Resolved feedback from',
  reopen_feedback: 'Reopened feedback from',
};

export default function AdminLogScreen() {
  const { data: actions, isLoading, isError } = useAdminActions();

  return (
    <AdminGate title="Admin log" back>
      {isLoading ? (
        <Text style={styles.status}>Loading…</Text>
      ) : isError ? (
        <Text style={styles.errorText}>Couldn&apos;t load the log.</Text>
      ) : !actions || actions.length === 0 ? (
        <Text style={styles.status}>Nothing recorded yet.</Text>
      ) : (
        actions.map((entry) => {
          const quota = (entry.detail as { quota?: number } | null)?.quota;
          return (
            <Card key={entry.id} style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.action}>
                  {ACTION_LABELS[entry.action] ?? entry.action} {entry.subject_label ?? '—'}
                  {entry.action === 'set_invite_quota' && quota !== undefined ? ` → ${quota}` : ''}
                </Text>
                <Text style={styles.when}>{new Date(entry.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.meta}>by {entry.actor_email ?? 'a deleted account'}</Text>
              {entry.reason ? <Text style={styles.reason}>“{entry.reason}”</Text> : null}
            </Card>
          );
        })
      )}
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  headerRow: { gap: spacing.xs },
  action: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  when: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  reason: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.sm,
  },
});
