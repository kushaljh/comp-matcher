// The "are you allowed to see this" wrapper every Admin screen sits inside.
//
// This is UX, not security. RLS and the admin RPCs are the real gate — a
// non-admin who reached these screens would get empty reads and raised
// exceptions regardless. What this buys is a clear "Not authorized" instead of
// a screen full of failed queries, and one place to change that behaviour.

import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Screen } from '../../theme/components';
import { colors, fontSizes, fontWeights, spacing } from '../../theme/tokens';
import { useIsAdmin } from './hooks';

export function AdminGate({
  title,
  back,
  children,
}: {
  title: string;
  /** Omitted on the landing page, which is already the tab's root. */
  back?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: isAdmin, isLoading } = useIsAdmin();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {back ? (
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Admin</Text>
          </Pressable>
        ) : null}

        <Text style={styles.title}>{title}</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.brass} />
        ) : !isAdmin ? (
          <Text style={styles.notAuthorized}>Not authorized.</Text>
        ) : (
          children
        )}
      </ScrollView>
    </Screen>
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
});
