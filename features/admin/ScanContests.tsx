import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import type { Enums } from '../../lib/database.types';
import { SCRAPE_CONTESTS_ENDPOINT } from './scrapeConfig';

export type ContestSuggestion = {
  name: string;
  divisions: Enums<'division'>[];
};

async function scrapeContests(websiteUrl: string): Promise<ContestSuggestion[]> {
  const res = await fetch(
    `${SCRAPE_CONTESTS_ENDPOINT}?url=${encodeURIComponent(websiteUrl)}`
  );
  const body = await res.json().catch(() => null);
  if (!body?.ok) {
    throw new Error(body?.error ?? `Scan failed (status ${res.status}).`);
  }
  return body.contests as ContestSuggestion[];
}

type ScanContestsSectionProps = {
  websiteUrl: string;
  // Present on approved events: tapping a suggestion prefills the add-contest
  // form. Absent on pending events: suggestions render read-only with a note.
  onPick?: (suggestion: ContestSuggestion) => void;
};

// "Scan site for contests" button + suggestion list. The scraper only ever
// SUGGESTS — nothing is written until the admin reviews and taps Add.
export function ScanContestsSection({ websiteUrl, onPick }: ScanContestsSectionProps) {
  const [suggestions, setSuggestions] = useState<ContestSuggestion[] | null>(null);
  const scanMutation = useMutation({
    mutationFn: () => scrapeContests(websiteUrl),
    onSuccess: setSuggestions,
  });

  return (
    <View style={styles.wrap}>
      <Button
        title={scanMutation.isPending ? 'Scanning…' : 'Scan site for contests'}
        variant="secondary"
        onPress={() => scanMutation.mutate()}
        loading={scanMutation.isPending}
      />

      {scanMutation.isError ? (
        <Text style={styles.errorText}>
          {scanMutation.error instanceof Error
            ? scanMutation.error.message
            : 'Could not scan that site.'}
        </Text>
      ) : null}

      {suggestions !== null && suggestions.length === 0 ? (
        <Text style={styles.emptyText}>
          Nothing recognized on that page — add contests manually.
        </Text>
      ) : null}

      {suggestions && suggestions.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listLabel}>
            {onPick
              ? 'Found on the site — tap one to prefill the form:'
              : 'Found on the site (addable after approving):'}
          </Text>
          {suggestions.map((s) => {
            const row = (
              <View style={styles.suggestionRow}>
                <Text style={styles.suggestionName}>{s.name}</Text>
                <Text style={styles.suggestionDivisions}>
                  {s.divisions.length ? s.divisions.join(', ') : 'no divisions detected'}
                </Text>
              </View>
            );
            return onPick ? (
              <Pressable key={s.name} onPress={() => onPick(s)} style={styles.pickable}>
                {row}
              </Pressable>
            ) : (
              <View key={s.name} style={styles.pickable}>
                {row}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSizes.xs,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  list: {
    gap: spacing.xs,
  },
  listLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  pickable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.creamDark,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  suggestionRow: {
    gap: 2,
  },
  suggestionName: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  suggestionDivisions: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
});
