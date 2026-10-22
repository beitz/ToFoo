/** Date ranges for reviewing the past: presets and labels. Day keys as in ./dates. */
import { addDays, daysBetween, formatDate, formatDay, parseDay } from './dates';

export type PeriodPreset = 'day' | 'week' | 'month' | 'range';

/** First day of the month, e.g. 2026-10-16 → 2026-10-01. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string): string {
  const d = parseDay(monthStart(day));
  d.setMonth(d.getMonth() + 1, 0);
  return `${day.slice(0, 7)}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Shift a month key (YYYY-MM) by n months. */
export function addMonths(month: string, n: number): string {
  const d = parseDay(`${month}-01`);
  d.setMonth(d.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The range a preset covers, ending at `anchor` (never after today). A month covers the whole calendar month up to today. */
export function presetRange(preset: Exclude<PeriodPreset, 'range'>, anchor: string, today: string): { from: string; to: string } {
  const to = anchor > today ? today : anchor;
  if (preset === 'day') return { from: to, to };
  if (preset === 'week') return { from: addDays(to, -6), to };
  const end = monthEnd(to);
  return { from: monthStart(to), to: end > today ? today : end };
}

export function presetOf(from: string, to: string, today: string): PeriodPreset {
  if (from === to) return 'day';
  if (daysBetween(from, to) === 6) return 'week';
  if (from === monthStart(from) && (to === monthEnd(from) || (to === today && monthStart(to) === from))) return 'month';
  return 'range';
}

export function formatMonth(month: string): string {
  return parseDay(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "Yesterday", "October 2026", "10.10. – 16.10." */
export function formatRange(from: string, to: string, today: string): string {
  if (from === to) return formatDay(from, today);
  if (presetOf(from, to, today) === 'month') return formatMonth(from.slice(0, 7));
  const f = (d: string) => formatDate(d, d.slice(0, 4) !== today.slice(0, 4));
  return `${f(from)} – ${f(to)}`;
}

/** Weeks of a month for a calendar grid, Monday first; null pads days outside the month. */
export function monthGrid(month: string): Array<Array<string | null>> {
  const first = `${month}-01`;
  const last = monthEnd(first);
  const lead = (parseDay(first).getDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Monday of the week a day falls in (weeks run Monday to Sunday, as in the calendar). */
export function weekStart(day: string): string {
  return addDays(day, -((parseDay(day).getDay() + 6) % 7));
}
