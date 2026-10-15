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

export function formatDay(key: string, today = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseDay(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
