/**
 * The journal page's sections (owner's ask, 2026-10-23: a long journal folds by year and month):
 * entries by day, days by month, newest first; months of the current year on their own, earlier
 * years each as one fold holding their months. Pure (tested in journalSections.test.ts).
 */

export interface JournalDay<E> {
  day: string;
  /** Oldest first, as written. */
  entries: E[];
}

export interface JournalMonth<E> {
  /** YYYY-MM */
  month: string;
  days: JournalDay<E>[];
  count: number;
}

export interface JournalYear<E> {
  /** YYYY */
  year: string;
  months: JournalMonth<E>[];
  count: number;
}

export function journalSections<E extends { day: string; time: number }>(entries: readonly E[], today: string): { months: JournalMonth<E>[]; years: JournalYear<E>[] } {
  const byDay = new Map<string, E[]>();
  for (const e of [...entries].sort((a, b) => a.time - b.time)) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const monthMap = new Map<string, JournalMonth<E>>();
  for (const day of [...byDay.keys()].sort().reverse()) {
    const key = day.slice(0, 7);
    const m = monthMap.get(key) ?? { month: key, days: [], count: 0 };
    const list = byDay.get(day)!;
    m.days.push({ day, entries: list });
    m.count += list.length;
    monthMap.set(key, m);
  }
  const thisYear = today.slice(0, 4);
  const months: JournalMonth<E>[] = [];
  const yearMap = new Map<string, JournalYear<E>>();
  for (const m of monthMap.values()) {
    const year = m.month.slice(0, 4);
    if (year >= thisYear) {
      months.push(m);
      continue;
    }
    const y = yearMap.get(year) ?? { year, months: [], count: 0 };
    y.months.push(m);
    y.count += m.count;
    yearMap.set(year, y);
  }
  return { months, years: [...yearMap.values()] };
}
