// Relative-time formatting for the Dance Card's "when" column — mono, terse,
// deco-style ("2 days ago", "Last week"). No dependency: the app already
// hand-rolls its date math elsewhere (see features/events/format.ts).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < MINUTE) return 'Just now';

  const minutes = Math.floor(diffMs / MINUTE);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(diffMs / HOUR);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(diffMs / DAY);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';

  const weeks = Math.floor(diffMs / WEEK);
  if (weeks < 8) return `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
