import { parseDay } from '../../lib/dates';

/** Default time for a new entry: now, or the same clock time on a past day. */
export function defaultTimeFor(day: string, today: string, now = new Date()): number {
  if (day === today) return now.getTime();
  const d = parseDay(day);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d.getTime();
}

/** Value for <input type="datetime-local">. */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(s: string): number | undefined {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : undefined;
}
