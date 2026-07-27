import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';

// Flight-style start/end range picker: one calendar, first tap sets the start,
// second tap sets the end (tapping before the start restarts the range).
// Hand-rolled on purpose — the dependency set is frozen, and plain Views work
// identically on iOS/Android/web.

type DateRangePickerProps = {
  startDate: string | null; // ISO YYYY-MM-DD
  endDate: string | null;
  onChange: (range: { startDate: string | null; endDate: string | null }) => void;
  error?: string;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function todayIso(): string {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
}

export function DateRangePicker({ startDate, endDate, onChange, error }: DateRangePickerProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const today = todayIso();

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function handleDayPress(day: number) {
    const picked = iso(viewYear, viewMonth, day);
    if (picked < today) return;
    if (!startDate || (startDate && endDate) || picked < startDate) {
      // Fresh range (or restart when tapping before the current start).
      onChange({ startDate: picked, endDate: null });
    } else {
      onChange({ startDate, endDate: picked });
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Dates</Text>
      <View style={[styles.calendar, error ? styles.calendarError : null]}>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityLabel="Previous month"
            onPress={() => shiftMonth(-1)}
            style={styles.navBtn}
            hitSlop={8}
          >
            <Text style={styles.navGlyph}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <Pressable
            accessibilityLabel="Next month"
            onPress={() => shiftMonth(1)}
            style={styles.navBtn}
            hitSlop={8}
          >
            <Text style={styles.navGlyph}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={`${w}-${i}`} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>

        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={styles.weekRow}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (day === null) return <View key={col} style={styles.day} />;
              const value = iso(viewYear, viewMonth, day);
              const disabled = value < today;
              const isStart = value === startDate;
              const isEnd = value === endDate;
              const inRange =
                startDate && endDate && value > startDate && value < endDate;
              return (
                <Pressable
                  key={col}
                  accessibilityLabel={`Day ${value}`}
                  disabled={disabled}
                  onPress={() => handleDayPress(day)}
                  style={[
                    styles.day,
                    inRange ? styles.dayInRange : null,
                    isStart || isEnd ? styles.dayEndpoint : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      disabled ? styles.dayTextDisabled : null,
                      isStart || isEnd ? styles.dayTextEndpoint : null,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        <Text style={styles.hint}>
          {!startDate
            ? 'Tap the first day of the event'
            : !endDate
              ? 'Now tap the last day (tap the same day for a one-day event)'
              : 'Tap an earlier day to start over'}
        </Text>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  calendar: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    padding: spacing.sm,
  },
  calendarError: {
    borderColor: colors.red,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  navBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  navGlyph: {
    fontSize: fontSizes.lg,
    color: colors.brassDark,
    fontWeight: fontWeights.bold,
  },
  monthTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    paddingVertical: 2,
  },
  day: {
    flex: 1,
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  dayInRange: {
    backgroundColor: colors.creamDark,
  },
  dayEndpoint: {
    backgroundColor: colors.navy,
  },
  dayText: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  dayTextDisabled: {
    color: colors.border,
  },
  dayTextEndpoint: {
    color: colors.textInverse,
    fontWeight: fontWeights.semibold,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    marginTop: spacing.xs,
    color: colors.red,
    fontSize: fontSizes.sm,
  },
});
