// Date formatting/validation helpers for the events feature.
// No datepicker dependency (deps are frozen) — dates are entered as plain
// YYYY-MM-DD text and validated here.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Parsed with an explicit local-midnight time component so this never shifts
// a day backward/forward under UTC-offset timezones the way `new Date('2026-08-28')`
// (parsed as UTC midnight) can.
function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const startMonth = MONTHS[start.getMonth()];
  const endMonth = MONTHS[end.getMonth()];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startDate === endDate) {
    return `${startMonth} ${start.getDate()}, ${startYear}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}-${end.getDate()}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${startYear}`;
  }
  return `${startMonth} ${start.getDate()}, ${startYear} - ${endMonth} ${end.getDate()}, ${endYear}`;
}

// The Season's date block (month/day/year, rendered as three separate lines)
// and its "place · range" line (same range, no year — the year already shows
// in the date block) both derive from the same start/end pair.
export function formatEventDateBlock(startDate: string): { mon: string; day: string; year: string } {
  const d = parseDateOnly(startDate);
  return {
    mon: MONTHS[d.getMonth()].toUpperCase(),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

export function formatDateRangeShort(startDate: string, endDate: string): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const startMonth = MONTHS[start.getMonth()];
  const endMonth = MONTHS[end.getMonth()];

  if (startDate === endDate) return `${startMonth} ${start.getDate()}`;
  if (startMonth === endMonth) return `${startMonth} ${start.getDate()} – ${end.getDate()}`;
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
}

// Strict YYYY-MM-DD check, including calendar validity (rejects e.g. 2026-02-30).
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isPlausibleUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value);
}
