/**
 * Numbers for the nutrient page (design 2026-10-22): what was eaten and taken up per day, where it
 * came from in total or per time eaten, and where a store is heading at the recent rate. Pure
 * arithmetic on the model's output (tested in nutrientPage.test.ts); no physiological numbers.
 */
import type { DayStatus } from '../model/types';
import type { Contributor, DailyTotals, HistoryPoint, StoreResult } from '../model/simulate';
import { addDays } from '../lib/dates';

/** One day of "Eaten → taken up". Amounts are undefined on days the food log does not tell. */
export interface UptakeDay {
  day: string;
  eaten?: number;
  takenUp?: number;
  fasted: boolean;
  /** Some food eaten that day has no value for this nutrient: the amounts may be higher. */
  missing: boolean;
}

/** Days whose food log tells what was eaten (fasted days count as nothing eaten). */
const KNOWN: ReadonlySet<DayStatus | 'pending'> = new Set(['logged', 'fasted', 'filled', 'pending']);

/** The last `n` days (today last), with what was eaten and taken up of one nutrient. */
export function uptakeDays(days: readonly string[], daily: readonly DailyTotals[], dayStatus: Readonly<Record<string, DayStatus | 'pending'>>, id: string, n: number): UptakeDay[] {
  const out: UptakeDay[] = [];
  for (let i = Math.max(0, days.length - n); i < days.length; i++) {
    const day = days[i]!;
    const totals = daily[i];
    const status = dayStatus[day];
    const fasted = status === 'fasted';
    const known = status !== undefined && KNOWN.has(status) && !!totals;
    out.push({
      day,
      ...(known
        ? {
            eaten: totals.intake[id] ?? 0,
            takenUp: totals.absorbed.central[id] ?? 0,
          }
        : {}),
      fasted,
      missing: !!totals?.missing.has(id),
    });
  }
  return out;
}

export interface CameFromLine {
  label: string;
  /** Taken up over the window, or per time eaten. */
  amount: number;
  /** Share of everything taken up in the window (the same in both views). */
  share: number;
  /** Times eaten in the window; 0 when not known (e.g. a food logged under another name). */
  times: number;
}

/**
 * "Where it came from": the biggest sources and the rest as one line. The model gives the top
 * sources as an average per day with their share of all; `perTime` divides each source's window
 * total by how often it was eaten, so a food eaten once in a big portion shows next to a daily one.
 */
export function cameFrom(
  contributors: readonly Contributor[],
  windowDays: number,
  times: ReadonlyMap<string, number>,
  perTime: boolean,
  max = 4,
): { total: number; lines: CameFromLine[]; rest?: CameFromLine } {
  const sumAmount = contributors.reduce((s, c) => s + c.amount, 0);
  const sumShare = contributors.reduce((s, c) => s + c.share, 0);
  const total = sumShare > 0 ? (sumAmount / sumShare) * windowDays : 0;
  const all = contributors.map((c) => {
    const n = times.get(c.label) ?? 0;
    const inWindow = c.amount * windowDays;
    return {
      label: c.label,
      amount: perTime && n > 0 ? inWindow / n : inWindow,
      share: c.share,
      times: n,
    };
  });
  all.sort((a, b) => b.amount - a.amount);
  const lines = all.slice(0, max);
  const restShare = Math.max(0, 1 - lines.reduce((s, x) => s + x.share, 0));
  // Sources too small to list on their own; less than half a percent is rounding, not a source.
  if (restShare < 0.005) return { total, lines };
  return {
    total,
    lines,
    rest: { label: '', amount: restShare * total, share: restShare, times: 0 },
  };
}

/** How often each label was eaten on the given days. */
export function timesEaten(entries: ReadonlyArray<{ label?: string; day: string }>, days: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) if (e.label && days.has(e.day)) out.set(e.label, (out.get(e.label) ?? 0) + 1);
  return out;
}

/**
 * Where the store is heading if the recent net rate goes on: a straight line from today's level,
 * kept between empty and full. Only the middle estimate, since the rate itself is an average.
 */
export function storeAhead(store: Pick<StoreResult, 'capacity' | 'level' | 'netPerDay'>, today: string, days: number): HistoryPoint[] {
  if (!store.capacity || store.netPerDay === undefined) return [];
  const out: HistoryPoint[] = [];
  for (let k = 1; k <= days; k++) {
    const fill = Math.max(0, Math.min(1, (store.level.central + store.netPerDay * k) / store.capacity));
    out.push({ day: addDays(today, k), low: fill, central: fill, high: fill });
  }
  return out;
}
