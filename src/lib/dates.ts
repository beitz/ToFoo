/** Local calendar helpers. Day keys are local dates as YYYY-MM-DD. */

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now = new Date()): string {
  return dayKey(now);
}

/** Parse a day key as local noon (safe across DST). */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/** All day keys from `from` to `to` inclusive. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** UTC offset in hours of local time on that day (e.g. 2 for CEST). */
export function utcOffsetHours(key: string): number {
  return -parseDay(key).getTimezoneOffset() / 60;
}

// Dates are shown the German way (22.10.2026, 24-hour clock) whatever the
// phone's locale, since en-US formats (10/22/2026, 1:45 PM) were confusing.
// Words (weekdays, months) stay in the UI language.
const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (d: Date | string) => (typeof d === 'string' ? parseDay(d) : d);

/** "Wed" */
export function weekdayShort(d: Date | string): string {
  return toDate(d).toLocaleDateString('en-GB', { weekday: 'short' });
}

/** "22.10.2026", or "22.10." without the year. */
export function formatDate(d: Date | string, withYear = true): string {
  const date = toDate(d);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${withYear ? date.getFullYear() : ''}`;
}

/** "Today", "Yesterday", "Wed 22.10." (with the year when it is not this year's). */
export function formatDay(key: string, today = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return `${weekdayShort(key)} ${formatDate(key, key.slice(0, 4) !== today.slice(0, 4))}`;
}

/** "13:45" */
export function formatTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Wed 22.10., 13:45" (with the year when it is not this year's). */
export function formatDateTime(t: number, today = todayKey()): string {
  const key = dayKey(new Date(t));
  return `${weekdayShort(key)} ${formatDate(key, key.slice(0, 4) !== today.slice(0, 4))}, ${formatTime(t)}`;
}
