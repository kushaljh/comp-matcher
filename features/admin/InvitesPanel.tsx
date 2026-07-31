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
import type { InviteRow } from '../invites/api';
import { useAllInvites, useCreateInvite, useDeleteInvite } from '../invites/hooks';
import { shareInvite } from '../invites/inviteLink';
import { confirmAsync } from '../profile/confirm';

// Admins delete any invite, not just their own (invites_admin_delete). The
// confirm copy splits on whether the code was claimed, because the two cases
// mean very different things: killing an outstanding code closes a door,
// while deleting a claimed one only drops the paper trail — app_members
// survives it, so the person stays a member either way.
function DeleteInviteButton({ invite }: { invite: InviteRow }) {
  const deleteInvite = useDeleteInvite();
  // redeemed_at, not redeemed_by: the latter is ON DELETE SET NULL, so it
  // reads as 'never used' once the person who used it deletes their account.
  const claimed = invite.redeemed_at != null;

  async function handleDelete() {
    const confirmed = await confirmAsync(
      claimed ? 'Delete this claimed invite?' : 'Delete this invite?',
      claimed
        ? `${invite.code} has already been used. Deleting it removes the record only — the dancer who claimed it keeps their access. Suspend them instead if you want them off the floor.`
        : `${invite.code} will stop working immediately, and the slot goes back to whoever created it.`,
      'Delete'
    );
    if (confirmed) deleteInvite.mutate(invite.id);
  }

  return (
    <Button
      title={deleteInvite.isPending ? 'Deleting…' : 'Delete'}
      variant="secondary"
      onPress={handleDelete}
      disabled={deleteInvite.isPending}
    />
  );
}

export function InvitesPanel() {
  const { data: invites, isLoading } = useAllInvites();
  const createInvite = useCreateInvite();

  // See the note in DeleteInviteButton: a spent code is one with a
  // redeemed_at, whether or not the account that spent it still exists.
  const outstanding = invites?.filter((i) => i.redeemed_at == null) ?? [];
  const claimed = invites?.filter((i) => i.redeemed_at != null) ?? [];

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
              {invite.redeemed_at
                ? `Claimed ${new Date(invite.redeemed_at).toLocaleDateString()}`
                : `Created ${new Date(invite.created_at).toLocaleDateString()}`}
            </Text>
          </View>
          <View style={styles.rowActions}>
            {invite.redeemed_at ? null : (
              <Button title="Share" variant="secondary" onPress={() => shareInvite(invite.code)} />
            )}
            <DeleteInviteButton invite={invite} />
          </View>
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
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
