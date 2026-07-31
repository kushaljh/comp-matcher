// Realtime match notifications. The dancer who liked FIRST only gets a match
// when the OTHER person swipes — on someone else's device — so nothing local
// ever tells them. This subscribes to INSERTs on `matches` (RLS-scoped: the
// realtime stream only delivers rows the signed-in user is a member of),
// refreshes the Dance Card caches, and raises a small art-deco banner.
//
// The second liker already gets the Deck's full-screen celebration; the Deck
// calls suppressMatchBanner() for that pair so they don't get both.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { TestPill } from '../shared/TestPill';
import { useTheme } from '../../theme/ThemeProvider';

// pair key = `${contestId}:${otherProfileId}:${myRoleInThatPairing}`
//
// The role is part of the key because two dancers can now pair TWICE in one
// contest — once leading, once following. Without it, the Deck suppressing its
// own celebration for one pairing would also swallow the banner for the other.
const suppressed = new Set<string>();

/** Called by the Deck right before it shows its own match celebration. */
export function suppressMatchBanner(pairKey: string) {
  suppressed.add(pairKey);
  setTimeout(() => suppressed.delete(pairKey), 15_000);
}

type Banner = {
  matchId: string;
  name: string;
  isTest: boolean;
};

function useLiveProfileId() {
  return useQuery({
    queryKey: ['live', 'profileId'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_profile_id');
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export function MatchLiveBanner() {
  const { colors, fonts, fs, radii } = useTheme();
  const queryClient = useQueryClient();
  const { data: profileId } = useLiveProfileId();
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    if (!profileId) return;

    const onInsert = async (row: {
      id: string;
      contest_id: string;
      profile_a: string;
      profile_a_role: 'leader' | 'follower';
      profile_b: string;
    }) => {
      // Whatever else happens, the Dance Card must reflect the new match.
      queryClient.invalidateQueries({ queryKey: ['matches'] });

      const isA = row.profile_a === profileId;
      const other = isA ? row.profile_b : row.profile_a;
      // profile_a_role is stored from a's side, so being profile_b means my
      // role is the inverse of what the row records.
      const myRole = isA
        ? row.profile_a_role
        : row.profile_a_role === 'leader'
          ? 'follower'
          : 'leader';
      if (suppressed.has(`${row.contest_id}:${other}:${myRole}`)) return;

      const { data } = await supabase
        .from('profiles')
        .select('display_name, is_test')
        .eq('id', other)
        .maybeSingle();
      setBanner({
        matchId: row.id,
        name: data?.display_name ?? 'A dancer',
        isTest: data?.is_test ?? false,
      });
    };

    const channel = supabase
      .channel(`matches-live-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `profile_a=eq.${profileId}` },
        (payload) => onInsert(payload.new as Parameters<typeof onInsert>[0])
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `profile_b=eq.${profileId}` },
        (payload) => onInsert(payload.new as Parameters<typeof onInsert>[0])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);

  // Auto-dismiss so an unattended screen doesn't hold the banner forever.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 12_000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.surface,
            borderColor: colors.brass,
            borderRadius: radii.rSm,
          },
        ]}
      >
        <Text style={{ fontFamily: fonts.mono, fontSize: fs(9), letterSpacing: 1.8, color: colors.brass }}>
          ✦ YOU'VE GOT A PARTNER
        </Text>
        <View style={styles.nameRow}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontFamily: fonts.serif, fontSize: fs(20), color: colors.ink }}
          >
            {banner.name}
          </Text>
          {banner.isTest ? <TestPill /> : null}
        </View>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBanner(null);
              router.push('/matches');
            }}
            style={[styles.cta, { backgroundColor: colors.brass, borderRadius: radii.pill }]}
          >
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(12),
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: colors.bg,
              }}
            >
              Open the dance card
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setBanner(null)}
            hitSlop={8}
            style={styles.dismiss}
          >
            <Text style={{ fontFamily: fonts.body, fontSize: fs(15), color: colors.ink2 }}>✕</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 86,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  banner: {
    width: '92%',
    maxWidth: 420,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  cta: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  dismiss: {
    marginLeft: 'auto',
    padding: 4,
  },
});
