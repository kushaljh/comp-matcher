// The Season — approved events, each expanding into an inline panel of its
// contests. Tapping a division chip enters (or changes) the caller's entry
// directly; there's no separate join screen. Division pool counts and "am I
// entered" both come from features/events/hooks.ts's per-contest entries
// queries (entries are readable by every authenticated user).
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '../../../theme/components';
import { useTheme } from '../../../theme/ThemeProvider';
import type { Enums } from '../../../lib/database.types';
import type { ContestRow, EntryForCounts } from '../../../features/events/api';
import {
  useApprovedEvents,
  useContestsForEvents,
  useEntriesForContests,
  useJoinContest,
  useLeaveContest,
  useMyProfileId,
  useUpdateEntryDivision,
} from '../../../features/events/hooks';
import { formatDateRangeShort, formatEventDateBlock } from '../../../features/events/format';

const DIVISION_LABELS: Record<Enums<'division'>, string> = {
  novice: 'Novice',
  amateur: 'Amateur',
  advanced: 'Advanced',
  open: 'Open',
};

export default function EventsScreen() {
  const router = useRouter();
  const { colors, fonts, fs, radii } = useTheme();

  const eventsQuery = useApprovedEvents();
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const eventIds = useMemo(() => events.map((e) => e.id), [events]);

  const contestsResults = useContestsForEvents(eventIds);
  const contestsByEvent = useMemo(() => {
    const map = new Map<string, ContestRow[]>();
    eventIds.forEach((id, i) => map.set(id, contestsResults[i]?.data ?? []));
    return map;
  }, [eventIds, contestsResults]);

  const allContestIds = useMemo(
    () => Array.from(contestsByEvent.values()).flatMap((list) => list.map((c) => c.id)),
    [contestsByEvent]
  );

  const entriesResults = useEntriesForContests(allContestIds);
  const entriesByContest = useMemo(() => {
    const map = new Map<string, EntryForCounts[]>();
    allContestIds.forEach((id, i) => map.set(id, entriesResults[i]?.data ?? []));
    return map;
  }, [allContestIds, entriesResults]);

  const { data: profileId } = useMyProfileId();

  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [confirmingContestId, setConfirmingContestId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const joinMutation = useJoinContest();
  const updateDivisionMutation = useUpdateEntryDivision();
  const leaveMutation = useLeaveContest();

  function myEntry(contestId: string) {
    if (!profileId) return undefined;
    return entriesByContest.get(contestId)?.find((e) => e.profile_id === profileId);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      eventsQuery.refetch(),
      ...contestsResults.map((r) => r.refetch()),
      ...entriesResults.map((r) => r.refetch()),
    ]);
    setRefreshing(false);
  }

  function handleChipPress(contestId: string, division: Enums<'division'>) {
    if (!profileId) return;
    const existing = myEntry(contestId);
    if (existing) {
      if (existing.division === division) return;
      updateDivisionMutation.mutate({ entryId: existing.id, contestId, division });
    } else {
      joinMutation.mutate({ profileId, contestId, division });
    }
  }

  function handleWithdraw(contestId: string) {
    const existing = myEntry(contestId);
    if (!existing) return;
    leaveMutation.mutate({ entryId: existing.id, contestId });
    setConfirmingContestId(null);
  }

  if (eventsQuery.isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.brass} />
      </Screen>
    );
  }

  if (eventsQuery.isError) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.red, textAlign: 'center' }}>
          Couldn&apos;t load events:{' '}
          {eventsQuery.error instanceof Error ? eventsQuery.error.message : 'unknown error'}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brass} />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={{ fontFamily: fonts.display, fontSize: fs(25), letterSpacing: 1.2, color: colors.ink }}>
              The Season
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2, marginTop: 5 }}>
              Register for a contest to start pairing up.
            </Text>
            <View style={styles.deco}>
              <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
              <View style={[styles.diamond, { backgroundColor: colors.brass }]} />
              <View style={[styles.diamond, { borderWidth: 1, borderColor: colors.cardLine }]} />
              <View style={[styles.decoRule, { backgroundColor: colors.cardLine }]} />
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/events/suggest')}
            style={[styles.suggestButton, { borderColor: colors.line, borderRadius: radii.pill }]}
          >
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(12.5),
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: colors.brass,
              }}
            >
              Suggest an event
            </Text>
          </Pressable>
        </View>

        {events.length === 0 ? (
          <Text style={{ fontFamily: fonts.body, fontSize: fs(14), color: colors.ink2 }}>
            No upcoming events yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {events.map((event) => {
              const contests = contestsByEvent.get(event.id) ?? [];
              const mine = contests.filter((c) => myEntry(c.id)).length;
              const open = openEventId === event.id;
              const dateBlock = formatEventDateBlock(event.start_date);
              const range = formatDateRangeShort(event.start_date, event.end_date);

              return (
                <View
                  key={event.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: open ? colors.brass : colors.line,
                    },
                    open ? styles.cardExpandedShadow : null,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.dateBlock, { backgroundColor: colors.likeBg }]}>
                      <Text
                        style={{
                          fontFamily: fonts.condensedSemi,
                          fontSize: fs(11.5),
                          letterSpacing: 2,
                          textTransform: 'uppercase',
                          color: colors.brass,
                        }}
                      >
                        {dateBlock.mon}
                      </Text>
                      <Text style={{ fontFamily: fonts.deco, fontSize: fs(33), lineHeight: fs(33), color: colors.ink }}>
                        {dateBlock.day}
                      </Text>
                      <Text style={{ fontFamily: fonts.mono, fontSize: fs(8.5), letterSpacing: 1, color: colors.ink2 }}>
                        {dateBlock.year}
                      </Text>
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.nameStatusRow}>
                        <Text
                          style={{ fontFamily: fonts.serif, fontSize: fs(22), color: colors.ink, flexShrink: 1 }}
                        >
                          {event.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: fonts.mono,
                            fontSize: fs(9),
                            letterSpacing: 1.4,
                            textTransform: 'uppercase',
                            color: mine ? colors.brass : colors.ink2,
                          }}
                        >
                          {mine ? `Entered · ${mine} contest${mine === 1 ? '' : 's'}` : 'Not entered'}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: fonts.condensed,
                          fontSize: fs(13),
                          letterSpacing: 0.8,
                          textTransform: 'uppercase',
                          color: colors.ink2,
                        }}
                      >
                        {event.location} · {range}
                      </Text>
                      <View style={styles.toggleRow}>
                        <Pressable
                          onPress={() => setOpenEventId(open ? null : event.id)}
                          style={[
                            styles.togglePill,
                            {
                              borderRadius: radii.pill,
                              borderWidth: 1,
                              borderColor: open ? colors.brass : colors.line,
                              backgroundColor: open ? colors.likeBg : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontFamily: fonts.condensedSemi,
                              fontSize: fs(12),
                              letterSpacing: 1.4,
                              textTransform: 'uppercase',
                              color: open ? colors.brass : colors.ink2,
                            }}
                          >
                            {open ? 'Hide contests' : mine ? 'Manage entry' : 'Enter a contest'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {open ? (
                    <View style={styles.panel}>
                      {contests.length === 0 ? (
                        <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink2 }}>
                          No contests listed yet.
                        </Text>
                      ) : (
                        contests.map((contest, i) => {
                          const entries = entriesByContest.get(contest.id) ?? [];
                          const entry = myEntry(contest.id);
                          const div = entry?.division;
                          const poolCount = div
                            ? entries.filter((e) => e.division === div).length
                            : entries.length;
                          const poolLine = div
                            ? poolCount
                              ? `${poolCount} in ${div}`
                              : `nobody in ${div} yet — you're early`
                            : poolCount
                              ? `${poolCount} looking across divisions`
                              : 'nobody yet';

                          return (
                            <View
                              key={contest.id}
                              style={[
                                styles.contestRow,
                                { borderTopColor: colors.line, borderTopWidth: i === 0 ? 0 : 1 },
                              ]}
                            >
                              <View style={styles.contestHeaderRow}>
                                <Text
                                  style={{
                                    fontFamily: fonts.condensedSemi,
                                    fontSize: fs(14),
                                    letterSpacing: 1.4,
                                    textTransform: 'uppercase',
                                    color: colors.ink,
                                  }}
                                >
                                  {contest.name}
                                </Text>
                                <Text
                                  style={{
                                    fontFamily: fonts.mono,
                                    fontSize: fs(8.5),
                                    letterSpacing: 1.4,
                                    textTransform: 'uppercase',
                                    color: colors.ink2,
                                  }}
                                >
                                  {poolLine}
                                </Text>
                              </View>

                              <View style={styles.divisionRow}>
                                <Text
                                  style={{
                                    fontFamily: fonts.mono,
                                    fontSize: fs(8.5),
                                    letterSpacing: 1.6,
                                    textTransform: 'uppercase',
                                    color: colors.ink2,
                                    marginRight: 2,
                                  }}
                                >
                                  Division
                                </Text>
                                {contest.divisions.map((d) => {
                                  const selected = div === d;
                                  const count = entries.filter((e) => e.division === d).length;
                                  const textColor = selected ? colors.bg : div ? colors.ink : colors.ink2;
                                  return (
                                    <Pressable
                                      key={d}
                                      onPress={() => handleChipPress(contest.id, d)}
                                      style={[
                                        styles.chip,
                                        {
                                          borderRadius: radii.pill,
                                          borderWidth: 1,
                                          borderColor: selected ? colors.brass : colors.line,
                                          backgroundColor: selected ? colors.brass : 'transparent',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(11.5),
                                          letterSpacing: 1.2,
                                          textTransform: 'uppercase',
                                          color: textColor,
                                        }}
                                      >
                                        {DIVISION_LABELS[d]}
                                      </Text>
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(11.5),
                                          marginLeft: 7,
                                          opacity: 0.62,
                                          color: textColor,
                                        }}
                                      >
                                        {count}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              {div ? (
                                confirmingContestId === contest.id ? (
                                  <View style={styles.confirmRow}>
                                    <Text style={{ fontFamily: fonts.body, fontSize: fs(13), color: colors.ink }}>
                                      Withdraw from this contest?
                                    </Text>
                                    <Pressable
                                      onPress={() => handleWithdraw(contest.id)}
                                      style={[
                                        styles.confirmPill,
                                        { backgroundColor: colors.red, borderRadius: radii.pill },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(12),
                                          letterSpacing: 1.4,
                                          textTransform: 'uppercase',
                                          color: colors.bg,
                                        }}
                                      >
                                        Confirm
                                      </Text>
                                    </Pressable>
                                    <Pressable onPress={() => setConfirmingContestId(null)}>
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(12),
                                          letterSpacing: 1.4,
                                          textTransform: 'uppercase',
                                          color: colors.ink2,
                                        }}
                                      >
                                        Cancel
                                      </Text>
                                    </Pressable>
                                  </View>
                                ) : (
                                  <View style={styles.actionsRow}>
                                    <Pressable
                                      onPress={() => router.push('/swipe')}
                                      style={[
                                        styles.actionPill,
                                        { backgroundColor: colors.brass, borderRadius: radii.pill },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(12),
                                          letterSpacing: 1.4,
                                          textTransform: 'uppercase',
                                          color: colors.bg,
                                        }}
                                      >
                                        Find a partner
                                      </Text>
                                    </Pressable>
                                    <Pressable
                                      onPress={() => setConfirmingContestId(contest.id)}
                                      style={[
                                        styles.actionPillOutline,
                                        { borderColor: colors.line, borderRadius: radii.pill },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontFamily: fonts.condensedSemi,
                                          fontSize: fs(12),
                                          letterSpacing: 1.4,
                                          textTransform: 'uppercase',
                                          color: colors.ink2,
                                        }}
                                      >
                                        Withdraw
                                      </Text>
                                    </Pressable>
                                  </View>
                                )
                              ) : (
                                <Text
                                  style={{
                                    fontFamily: fonts.body,
                                    fontSize: fs(13),
                                    lineHeight: fs(19),
                                    color: colors.ink2,
                                  }}
                                >
                                  Pick a division to enter — that opens the floor for this contest.
                                </Text>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  headerTextCol: {
    flexShrink: 1,
  },
  deco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13,
    width: 220,
  },
  decoRule: {
    flex: 1,
    height: 1,
  },
  diamond: {
    width: 5,
    height: 5,
    transform: [{ rotate: '45deg' }],
  },
  suggestButton: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  list: {
    gap: 14,
  },
  card: {
    overflow: 'hidden',
  },
  cardExpandedShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  cardTop: {
    flexDirection: 'row',
  },
  dateBlock: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 16,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    paddingLeft: 18,
    gap: 10,
  },
  nameStatusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  togglePill: {
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  panel: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  contestRow: {
    paddingVertical: 14,
    gap: 10,
  },
  contestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  divisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 9,
    flexWrap: 'wrap',
  },
  actionPill: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  actionPillOutline: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexWrap: 'wrap',
  },
  confirmPill: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
});
