// "Your invites" — rendered inside Settings (app/(tabs)/settings/index.tsx).
//
// The quota lives in the database (my_invites_remaining()), not here: this
// only mirrors it, so the button state and create_invite()'s own check can
// never disagree about whether you have one left.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAsync } from '../profile/confirm';
import { useTheme } from '../../theme/ThemeProvider';
import { useCreateInvite, useDeleteInvite, useInvitesRemaining, useMyInvites } from './hooks';
import { shareInvite } from './inviteLink';
import type { InviteRow } from './api';

function InviteRowView({ invite }: { invite: InviteRow }) {
  const { colors, fonts, fs, radii } = useTheme();
  const [flash, setFlash] = useState<string | null>(null);
  const deleteInvite = useDeleteInvite();
  const claimed = invite.redeemed_by != null;

  async function handleShare() {
    try {
      setFlash(await shareInvite(invite.code));
      setTimeout(() => setFlash(null), 2000);
    } catch {
      setFlash('Could not share');
      setTimeout(() => setFlash(null), 2000);
    }
  }

  async function handleWithdraw() {
    const confirmed = await confirmAsync(
      'Withdraw this invite?',
      `${invite.code} will stop working, and the slot goes back to you.`,
      'Withdraw'
    );
    if (confirmed) deleteInvite.mutate(invite.id);
  }

  return (
    <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={styles.rowMain}>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: fs(14),
            letterSpacing: 1.5,
            color: claimed ? colors.ink2 : colors.ink,
            textDecorationLine: claimed ? 'line-through' : 'none',
          }}
        >
          {invite.code}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(12), color: colors.ink2, marginTop: 2 }}>
          {claimed ? 'Claimed' : 'Not used yet'}
        </Text>
      </View>

      {claimed ? null : (
        <View style={styles.rowActions}>
          <Pressable onPress={handleShare} accessibilityRole="button" hitSlop={8}>
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(11.5),
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: colors.brass,
              }}
            >
              {flash ?? 'Share'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleWithdraw}
            disabled={deleteInvite.isPending}
            accessibilityRole="button"
            hitSlop={8}
            style={{ borderRadius: radii.pill }}
          >
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(11.5),
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: colors.ink2,
              }}
            >
              Withdraw
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function InvitesSection() {
  const { colors, fonts, fs, radii } = useTheme();
  const { data: invites } = useMyInvites();
  const { data: remaining } = useInvitesRemaining();
  const createInvite = useCreateInvite();

  const unlimited = remaining === -1;
  const canCreate = unlimited || (remaining ?? 0) > 0;
  // Inviting is granted, not given: a new member's quota starts at 0 until an
  // admin raises it. "0 left" would read as "you spent them", which is the
  // wrong story for someone who never had any — so distinguish the two.
  const neverHadAny = !unlimited && (remaining ?? 0) === 0 && (invites?.length ?? 0) === 0;

  return (
    <View style={[styles.block, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
      <View style={styles.row}>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14.5), color: colors.ink }}>
          {unlimited ? 'Invites' : neverHadAny ? 'Not yet' : `${remaining ?? 0} left`}
        </Text>
        {neverHadAny ? null : (
          <Pressable
            onPress={() => createInvite.mutate()}
            disabled={!canCreate || createInvite.isPending}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(12),
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: canCreate ? colors.brass : colors.ink2,
              }}
            >
              {createInvite.isPending ? 'Creating…' : 'New code'}
            </Text>
          </Pressable>
        )}
      </View>

      {createInvite.isError ? (
        <Text style={[styles.message, { fontFamily: fonts.body, fontSize: fs(13), color: colors.red }]}>
          {createInvite.error instanceof Error
            ? createInvite.error.message
            : 'Could not create an invite.'}
        </Text>
      ) : null}

      {invites && invites.length > 0 ? (
        invites.map((invite) => <InviteRowView key={invite.id} invite={invite} />)
      ) : (
        <Text style={[styles.message, { fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }]}>
          {neverHadAny
            ? 'An organiser hasn’t given you invites yet. Ask one if there’s someone you’d vouch for.'
            : 'You haven’t made any invites yet.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowMain: { flexShrink: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  message: { paddingHorizontal: 14, paddingBottom: 12 },
});
