// Admin roster: find a dancer, see how they got in, decide what they may do.
//
// Two levers, in order of how often you'll reach for them:
//   * INVITE QUOTA — a new member starts at 0 and cannot invite anyone until
//     an admin raises it. Whoever let them in vouched for them; vouching for
//     others is a separate grant.
//   * SUSPEND / REINSTATE — reversible, deletes nothing. Entries, swipes and
//     pairings all survive, so a reinstated dancer picks up where they left off.
// Neither is silent: both write to admin_actions with the acting admin, the
// subject and (for suspension) a reason.
//
// What this shows about a dancer — inviter, signup date, invite usage — comes
// from admin_dancer_roster(), an RPC with an explicit column list. That IS new
// visibility versus the plain profiles read this used to do; contacts, swipes
// and matches remain as private from admins as they always were.

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import type { RosterRow } from './api';
import {
  useAdminDancerContacts,
  useAdminRoster,
  useSetInviteQuota,
  useSetSuspended,
} from './hooks';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
};

function shortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// The handles a dancer added to be swapped on a match. Loaded only while
// their details are open — see the note on fetchDancerContacts().
function ContactList({ profileId, enabled }: { profileId: string; enabled: boolean }) {
  const { data: contacts, isLoading, isError } = useAdminDancerContacts(profileId, enabled);

  if (isLoading) return <Field label="Contacts" value="…" />;
  if (isError) return <Field label="Contacts" value="Couldn’t load" />;
  if (!contacts || contacts.length === 0) return <Field label="Contacts" value="None added" />;

  return (
    <>
      {contacts.map((c, i) => (
        <Field
          key={`${c.platform}-${i}`}
          label={PLATFORM_LABELS[c.platform] ?? c.platform}
          value={c.handle}
        />
      ))}
    </>
  );
}

function QuotaControl({ dancer }: { dancer: RosterRow }) {
  const setQuota = useSetInviteQuota();
  const [error, setError] = useState<string | null>(null);

  async function apply(next: number) {
    setError(null);
    try {
      await setQuota.mutateAsync({ profileId: dancer.profile_id, quota: next });
    } catch (err: any) {
      setError(err?.message ?? 'Could not change their invites.');
    }
  }

  const quota = dancer.invite_quota;
  const used = dancer.invites_created;

  return (
    <View style={styles.quotaRow}>
      <View style={styles.rowMain}>
        <Text style={styles.fieldLabel}>Invites</Text>
        <Text style={styles.fieldValue}>
          {quota === 0
            ? used > 0
              ? `None left — ${used} already out`
              : 'Cannot invite'
            : `${quota} granted · ${used} used · ${dancer.invites_claimed} claimed`}
        </Text>
      </View>
      {/* Bounds match admin_set_invite_quota()'s own 0..20 clamp, so a button
          can never ask for something the database will quietly refuse. */}
      <View style={styles.stepper}>
        <Button
          title="−"
          variant="secondary"
          onPress={() => apply(quota - 1)}
          disabled={quota <= 0 || setQuota.isPending}
        />
        <Button
          title="+"
          variant="secondary"
          onPress={() => apply(quota + 1)}
          disabled={quota >= 20 || setQuota.isPending}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function DancerCard({ dancer }: { dancer: RosterRow }) {
  const setSuspended = useSetSuspended();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const suspended = !!dancer.suspended_at;
  const place = [dancer.city, dancer.country].filter(Boolean).join(', ');

  async function apply(next: boolean) {
    setError(null);
    try {
      await setSuspended.mutateAsync({
        profileId: dancer.profile_id,
        suspended: next,
        reason: reason.trim() || null,
      });
      setConfirming(false);
      setReason('');
    } catch (err: any) {
      // The RPC raises for a non-admin caller and for self-suspension; surface
      // whatever it said rather than a generic failure.
      setError(err?.message ?? 'Could not change this account.');
      setConfirming(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{dancer.display_name}</Text>
        {suspended ? <Text style={styles.badge}>Suspended</Text> : null}
        {dancer.invite_quota === 0 ? <Text style={styles.mutedBadge}>No invites</Text> : null}
      </View>
      {place ? <Text style={styles.meta}>{place}</Text> : null}
      {suspended ? (
        <Text style={styles.meta}>Off the platform since {shortDate(dancer.suspended_at)}</Text>
      ) : null}

      <Text
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        style={styles.disclosure}
      >
        {expanded ? 'Hide details' : 'Details'}
      </Text>

      {expanded ? (
        <View style={styles.details}>
          <Field label="Email" value={dancer.email ?? '—'} />
          <ContactList profileId={dancer.profile_id} enabled={expanded} />
          <Field label="Invited by" value={dancer.invited_by_name ?? 'Founding member'} />
          <Field label="Signed up" value={shortDate(dancer.signed_up_at)} />
          <Field label="Finished their card" value={shortDate(dancer.onboarded_at)} />
          <QuotaControl dancer={dancer} />
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.buttonRow}>
        {suspended ? (
          <Button title="Reinstate" onPress={() => apply(false)} loading={setSuspended.isPending} />
        ) : confirming ? (
          <>
            <Text style={styles.confirmText}>
              Suspend {dancer.display_name}? They stop appearing in decks and can&apos;t swipe or
              enter contests. Nothing is deleted — you can undo this.
            </Text>
            <TextField
              label="Reason (kept in the admin log)"
              value={reason}
              onChangeText={setReason}
              placeholder="Optional — but future you will want it"
            />
            <Button
              title="Confirm suspend"
              variant="destructive"
              onPress={() => apply(true)}
              loading={setSuspended.isPending}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
          </>
        ) : (
          <Button title="Suspend" variant="destructive" onPress={() => setConfirming(true)} />
        )}
      </View>
    </Card>
  );
}

export function DancerRoster() {
  const { data: dancers, isLoading, isError } = useAdminRoster();
  const [query, setQuery] = useState('');

  const { suspended, active } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = (dancers ?? []).filter(
      (d) =>
        !q ||
        d.display_name.toLowerCase().includes(q) ||
        (d.email ?? '').toLowerCase().includes(q) ||
        (d.invited_by_name ?? '').toLowerCase().includes(q)
    );
    return {
      // Suspended first: an admin coming back to this screen is usually here to
      // review or undo, not to suspend someone new.
      suspended: matched.filter((d) => d.suspended_at),
      active: matched.filter((d) => !d.suspended_at),
    };
  }, [dancers, query]);

  if (isLoading) return <Text style={styles.status}>Loading…</Text>;
  if (isError) return <Text style={styles.errorText}>Couldn&apos;t load the roster.</Text>;

  return (
    <>
      <TextField
        label="Find a dancer"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="Search by name, email, or who invited them"
      />

      {suspended.length ? (
        <>
          <Text style={styles.groupTitle}>Suspended · {suspended.length}</Text>
          {suspended.map((d) => (
            <DancerCard key={d.profile_id} dancer={d} />
          ))}
        </>
      ) : null}

      <Text style={styles.groupTitle}>Active · {active.length}</Text>
      {active.length === 0 ? (
        <Text style={styles.status}>No dancers match that search.</Text>
      ) : (
        active.map((d) => <DancerCard key={d.profile_id} dancer={d} />)
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  name: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  badge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.red,
    textTransform: 'uppercase',
  },
  mutedBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  disclosure: {
    fontSize: fontSizes.sm,
    color: colors.brassDark,
    marginTop: spacing.sm,
  },
  details: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  fieldValue: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rowMain: { flexShrink: 1 },
  stepper: { flexDirection: 'row', gap: spacing.xs },
  groupTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  status: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.xs,
    marginTop: spacing.sm,
  },
});
