// Admin view of every invite in the system: who minted it, whether it landed.
//
// Reads through the invites_admin_select policy, so the same fetchAllInvites()
// call would just return a plain member's own codes — the panel is not what
// makes this admin-only. Minting here uses the same create_invite() everyone
// uses; it simply skips the quota, because admins are exempt inside the
// function (my_invites_remaining() returns -1 for them).
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import { useAllInvites, useCreateInvite } from '../invites/hooks';
import { shareInvite } from '../invites/inviteLink';

export function InvitesPanel() {
  const { data: invites, isLoading } = useAllInvites();
  const createInvite = useCreateInvite();

  const outstanding = invites?.filter((i) => i.redeemed_by == null) ?? [];
  const claimed = invites?.filter((i) => i.redeemed_by != null) ?? [];

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.summary}>
          {isLoading
            ? 'Loading…'
            : `${outstanding.length} outstanding · ${claimed.length} claimed`}
        </Text>
        <Button
          title={createInvite.isPending ? 'Creating…' : 'New code'}
          variant="secondary"
          onPress={() => createInvite.mutate()}
          disabled={createInvite.isPending}
        />
      </View>

      {createInvite.isError ? (
        <Text style={styles.error}>
          {createInvite.error instanceof Error
            ? createInvite.error.message
            : 'Could not create an invite.'}
        </Text>
      ) : null}

      {!isLoading && (invites?.length ?? 0) === 0 ? (
        <Text style={styles.status}>No invites yet.</Text>
      ) : null}

      {invites?.map((invite) => (
        <View key={invite.id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.code}>{invite.code}</Text>
            <Text style={styles.meta}>
              {invite.redeemed_by
                ? `Claimed ${new Date(invite.redeemed_at as string).toLocaleDateString()}`
                : `Created ${new Date(invite.created_at).toLocaleDateString()}`}
            </Text>
          </View>
          {invite.redeemed_by ? null : (
            <Button title="Share" variant="secondary" onPress={() => shareInvite(invite.code)} />
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summary: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowMain: { flexShrink: 1 },
  code: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.red,
  },
});
