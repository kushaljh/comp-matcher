// Admin roster: find a dancer, take them off the platform, put them back.
//
// Suspension is the ONLY thing an admin can do to a dancer here, and it is
// reversible — it sets a timestamp, it deletes nothing. Entries, swipes and
// pairings all survive, so reinstating someone drops them back exactly where
// they were.
//
// This list is a plain profiles read, which every signed-in dancer can already
// do. Admins gained no visibility into who asked whom or who paired with whom;
// that stays private (see 20260728220000_suspend_users.sql).

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, TextField } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import type { DancerRow } from './api';
import { useAdminDancers, useSetSuspended } from './hooks';

function DancerCard({ dancer }: { dancer: DancerRow }) {
  const setSuspended = useSetSuspended();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspended = !!dancer.suspended_at;
  const place = [dancer.city, dancer.country].filter(Boolean).join(', ');

  async function apply(next: boolean) {
    setError(null);
    try {
      await setSuspended.mutateAsync({ profileId: dancer.id, suspended: next });
      setConfirming(false);
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
      </View>
      {place ? <Text style={styles.meta}>{place}</Text> : null}
      {suspended ? (
        <Text style={styles.meta}>
          Off the platform since {new Date(dancer.suspended_at as string).toLocaleDateString()}
        </Text>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.buttonRow}>
        {suspended ? (
          <Button
            title="Reinstate"
            onPress={() => apply(false)}
            loading={setSuspended.isPending}
          />
        ) : confirming ? (
          <>
            <Text style={styles.confirmText}>
              Suspend {dancer.display_name}? They stop appearing in decks and can&apos;t swipe or
              enter contests. Nothing is deleted — you can undo this.
            </Text>
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
  const { data: dancers, isLoading, isError } = useAdminDancers();
  const [query, setQuery] = useState('');

  const { suspended, active } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = (dancers ?? []).filter(
      (d) => !q || d.display_name.toLowerCase().includes(q)
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
        placeholder="Search by name"
      />

      {suspended.length ? (
        <>
          <Text style={styles.groupTitle}>Suspended · {suspended.length}</Text>
          {suspended.map((d) => (
            <DancerCard key={d.id} dancer={d} />
          ))}
        </>
      ) : null}

      <Text style={styles.groupTitle}>Active · {active.length}</Text>
      {active.length === 0 ? (
        <Text style={styles.status}>No dancers match that search.</Text>
      ) : (
        active.map((d) => <DancerCard key={d.id} dancer={d} />)
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
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
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
