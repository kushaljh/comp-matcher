import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';

// Flight-style start/end range input: two typeable date fields (YYYY-MM-DD)
// plus a shared calendar picker that opens when a field is focused. Typing and
// tapping both commit to the same {startDate, endDate} range.
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

// True only for a syntactically valid, real calendar date (rejects 2026-02-31).
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Keep typed input shaped like YYYY-MM-DD as the user goes.
function maskDateInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 8);
  let out = digits.slice(0, 4);
  if (digits.length > 4) out += '-' + digits.slice(4, 6);
  if (digits.length > 6) out += '-' + digits.slice(6, 8);
  return out;
}

type Field = 'start' | 'end';

export function DateRangePicker({ startDate, endDate, onChange, error }: DateRangePickerProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Local drafts so half-typed dates don't fight the committed range.
  const [drafts, setDrafts] = useState<{ start: string; end: string }>({
    start: startDate ?? '',
    end: endDate ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<{ start?: string; end?: string }>({});
  const today = todayIso();

  function jumpToMonth(value: string) {
    const [y, m] = value.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }

  function commitTyped(field: Field, value: string) {
    if (value === '') {
      setFieldErrors((p) => ({ ...p, [field]: undefined }));
      onChange(
        field === 'start'
          ? { startDate: null, endDate }
          : { startDate, endDate: null }
      );
      return;
    }
    if (!isRealDate(value)) {
      setFieldErrors((p) => ({ ...p, [field]: 'Use YYYY-MM-DD' }));
      return;
    }
    if (value < today) {
      setFieldErrors((p) => ({ ...p, [field]: 'Date is in the past' }));
      return;
    }
    setFieldErrors((p) => ({ ...p, [field]: undefined }));
    jumpToMonth(value);
    if (field === 'start') {
      // Typing a start after the current end restarts the range.
      onChange({ startDate: value, endDate: endDate && value > endDate ? null : endDate });
    } else {
      if (startDate && value < startDate) {
        setFieldErrors((p) => ({ ...p, end: 'End is before the start date' }));
        return;
      }
      onChange({ startDate, endDate: value });
    }
  }

  function handleType(field: Field, raw: string) {
    const masked = maskDateInput(raw);
    setDrafts((p) => ({ ...p, [field]: masked }));
    // Commit eagerly once the value is fully typed; otherwise wait for blur.
    if (masked.length === 10) commitTyped(field, masked);
  }

  function handleDayPress(day: number) {
    const picked = iso(viewYear, viewMonth, day);
    if (picked < today) return;
    setFieldErrors({});
    if (!startDate || (startDate && endDate) || picked < startDate) {
      onChange({ startDate: picked, endDate: null });
      setDrafts({ start: picked, end: '' });
    } else {
      onChange({ startDate, endDate: picked });
      setDrafts((p) => ({ ...p, end: picked }));
      setCalendarOpen(false); // range complete — collapse, flight-form style
    }
  }

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

  const renderField = (field: Field, label: string) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={drafts[field]}
        onChangeText={(v) => handleType(field, v)}
        onFocus={() => {
          setCalendarOpen(true);
          const committed = field === 'start' ? startDate : endDate;
          if (committed) jumpToMonth(committed);
        }}
        onBlur={() => commitTyped(field, drafts[field])}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
        autoCapitalize="none"
        style={[
          styles.input,
          fieldErrors[field] ? styles.inputError : null,
        ]}
      />
      {fieldErrors[field] ? <Text style={styles.fieldError}>{fieldErrors[field]}</Text> : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.fieldsRow}>
        {renderField('start', 'Start date')}
        {renderField('end', 'End date')}
        <Pressable
          accessibilityLabel={calendarOpen ? 'Hide calendar' : 'Show calendar'}
          onPress={() => setCalendarOpen((o) => !o)}
          style={styles.calToggle}
          hitSlop={8}
        >
          <Text style={styles.calToggleGlyph}>📅</Text>
        </Pressable>
      </View>

      {calendarOpen ? (
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
              ? 'Tap the first day of the event — or just type the dates'
              : !endDate
                ? 'Now tap the last day (same day = one-day event)'
                : 'Tap an earlier day to start over'}
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  fieldWrap: {
    flex: 1,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  inputError: {
    borderColor: colors.red,
  },
  fieldError: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    color: colors.red,
  },
  calToggle: {
    paddingBottom: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
  },
  calToggleGlyph: {
    fontSize: fontSizes.lg,
  },
  calendar: {
    marginTop: spacing.sm,
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
