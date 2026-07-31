// Every note a dancer has sent, new ones first.
//
// Reads through the feedback_admin_select policy — and unlike the invites
// panel, that IS what makes this admin-only: feedback has no other select
// policy, so the same fetchFeedback() call returns nothing at all for a plain
// member. Resolving goes through admin_set_feedback_status(), which is also
// what writes the 'resolve_feedback' line into the admin log.
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import type { FeedbackRow } from './api';
import { useAdminFeedback, useSetFeedbackStatus } from './hooks';

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  idea: 'Idea',
  other: 'Other',
};

function FeedbackCard({ item }: { item: FeedbackRow }) {
  const setStatus = useSetFeedbackStatus();
  const resolved = item.status === 'resolved';

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
        <Text style={styles.when}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{item.message}</Text>
      {/* author_name and author_email are stamped onto the row at insert, so a
          note still says who sent it after they delete their account. */}
      <Text style={styles.meta}>
        from {item.author_name ?? item.author_email ?? 'a deleted account'}
        {item.author_name && item.author_email ? ` · ${item.author_email}` : ''}
      </Text>
      <View style={styles.actions}>
        <Button
          title={
            setStatus.isPending ? 'Saving…' : resolved ? 'Reopen' : 'Mark resolved'
          }
          variant="secondary"
          onPress={() => setStatus.mutate({ id: item.id, status: resolved ? 'new' : 'resolved' })}
          disabled={setStatus.isPending}
        />
      </View>
      {setStatus.isError ? (
        <Text style={styles.error}>
          {setStatus.error instanceof Error ? setStatus.error.message : 'Could not update this note.'}
        </Text>
      ) : null}
    </Card>
  );
}

export function FeedbackPanel() {
  const { data: feedback, isLoading, isError } = useAdminFeedback();

  const fresh = feedback?.filter((f) => f.status === 'new') ?? [];
  const resolved = feedback?.filter((f) => f.status === 'resolved') ?? [];

  if (isLoading) return <Text style={styles.status}>Loading…</Text>;
  if (isError) return <Text style={styles.error}>Couldn&apos;t load the feedback.</Text>;
  if (!feedback || feedback.length === 0) {
    return <Text style={styles.status}>Nothing sent yet.</Text>;
  }

  return (
    <View>
      {fresh.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>New · {fresh.length}</Text>
          {fresh.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}
        </>
      ) : (
        <Text style={styles.status}>Nothing new — everything below is handled.</Text>
      )}

      {resolved.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Resolved · {resolved.length}</Text>
          {resolved.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  category: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  when: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  message: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
