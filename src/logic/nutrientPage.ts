/**
 * Numbers for the nutrient page (design 2026-10-22): what was eaten and taken up per day, where it
 * came from in total or per time eaten, and where a store is heading at the recent rate. Pure
 * arithmetic on the model's output (tested in nutrientPage.test.ts); no physiological numbers.
 */
import type { DayStatus, ModelEntry } from '../model/types';
import type { Contributor, DailyTotals, HistoryPoint, MealSummary, StoreResult } from '../model/simulate';
import { entryIntake } from '../model/intake';
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

/** One day of the averaging window, as a dot under the number. */
export type WindowDot = 'known' | 'estimated' | 'leftOut';

export interface WindowDay {
  day: string;
  dot: WindowDot;
  /** Some food eaten that day has no value for this nutrient. */
  missing: boolean;
}

/**
 * The days behind a nutrient's average, oldest first, with how each one counts: logged or fasted
 * ('known'), filled in from recent days ('estimated'), or left out of every average. Same window
 * and the same rules as the model (src/model/simulate.ts): it ends yesterday, and without "Fill in
 * unlogged days" an unlogged past day counts as known with nothing eaten.
 */
export function windowDays(
  days: readonly string[],
  daily: readonly DailyTotals[],
  dayStatus: Readonly<Record<string, DayStatus | 'pending'>>,
  id: string,
  n: number,
  imputeUnlogged: boolean,
): WindowDay[] {
  const end = days.length - 2;
  const out: WindowDay[] = [];
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    const day = days[i]!;
    const st = dayStatus[day];
    const known = st === 'logged' || st === 'fasted' || (!imputeUnlogged && st === 'unknown');
    out.push({
      day,
      dot: st === 'excluded' ? 'leftOut' : known ? 'known' : 'estimated',
      missing: !!daily[i]?.missing.has(id),
    });
  }
  return out;
}

/**
 * A long window's days as weeks, oldest first, counted back from the newest day (so the oldest week may be
 * short): known when no day was filled in, left out when every day was, ringed when any day had a food
 * without data.
 */
export function weekMarks(days: readonly WindowDay[]): WindowDay[] {
  const out: WindowDay[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const week = days.slice(Math.max(0, end - 7), end);
    const dot: WindowDot = week.every((x) => x.dot === 'leftOut') ? 'leftOut' : week.some((x) => x.dot === 'estimated') ? 'estimated' : 'known';
    out.unshift({ day: week[0]!.day, dot, missing: week.some((x) => x.missing) });
  }
  return out;
}

/** Heights the need tile can grow to (multiples of the need), so values over 100 % keep their size. */
const TILE_TOPS = [1, 1.5, 2, 3];
const TILE_MAX = 3;

/**
 * The top of a need or limit tile: 100 % until the likely range goes past it, then the smallest
 * step that holds it. Past the last step the tile is full and `over` says it goes on above.
 */
export function tileTop(high: number): { top: number; over: boolean } {
  const top = TILE_TOPS.find((x) => high <= x + 1e-9);
  return top === undefined ? { top: TILE_MAX, over: true } : { top, over: false };
}

/**
 * "Where it came from" for any set of days (the nutrient page opened from a past day, week or range):
 * as the model does for its window, each meal's absorbed amount is split over its entries by their
 * share of the intake and summed by name. Amounts are per day over `days`, biggest first.
 */
export function contributorsOver(
  days: readonly string[],
  entries: readonly ModelEntry[],
  meals: readonly MealSummary[],
  id: string,
  opts: { retention: boolean },
): Contributor[] {
  if (days.length === 0) return [];
  const inDays = new Set(days);
  const mealOf = new Map<string, MealSummary>();
  for (const m of meals) if (inDays.has(m.day)) for (const e of m.entryIds) mealOf.set(e, m);
  const byLabel = new Map<string, number>();
  for (const e of entries) {
    const meal = inDays.has(e.dayKey) ? mealOf.get(e.id) : undefined;
    if (!meal) continue;
    const v = entryIntake(e, 'central', opts).intake[id] ?? 0;
    const total = meal.intake[id] ?? 0;
    if (v <= 0 || total <= 0) continue;
    byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + (meal.absorbed[id] ?? 0) * (v / total));
  }
  const all = [...byLabel.values()].reduce((a, b) => a + b, 0);
  return [...byLabel.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({ label, amount: amount / days.length, share: all > 0 ? amount / all : 0 }));
}

/** One day of a past period on the nutrient page: its number as the page's average counts it, or none. */
export interface PeriodDay {
  day: string;
  /** Share of the need or maximum (1 = 100 %), or the plain amount for nutrients without one; undefined: not counted. */
  value?: number;
  missing: boolean;
}

/**
 * The days of a past period for one nutrient, as the period's average counts them (model/period.ts):
 * absorbed ÷ physiological need, intake ÷ maximum, or plain intake. Days the average leaves out
 * (partly logged, filled in, left out) have no value.
 */
export function periodDays(
  range: readonly string[],
  counted: readonly string[],
  days: readonly string[],
  daily: readonly DailyTotals[],
  id: string,
  basis: { kind: 'rolling' | 'limit' | 'info'; ref?: number },
): PeriodDay[] {
  const idx = new Map(days.map((d, i) => [d, i]));
  const isCounted = new Set(counted);
  return range.map((day) => {
    const totals = daily[idx.get(day) ?? -1];
    if (!totals || !isCounted.has(day)) return { day, missing: false };
    const amount = basis.kind === 'rolling' ? (totals.absorbed.central[id] ?? 0) : (totals.intake[id] ?? 0);
    const value = basis.kind === 'info' || !basis.ref ? amount : amount / basis.ref;
    return { day, value, missing: totals.missing.has(id) };
  });
}
