/**
 * Weekly look-back (docs/SPEC.md, "Trends and weekly look-back"): averages per calendar week
 * (Monday to Sunday) for every nutrient and tracker, the weeks before it for the charts, and the
 * recap of what changed since the week before. Pure: tested in weekly.test.ts.
 *
 * Nutrient weeks are model/period.ts breakdowns, so a week's percentage means exactly what the
 * Review screen shows for that week: absorbed against the need, intake against a limit, only the
 * days that count in the model, nothing filled in.
 */
import { trendDisplay } from '../../model/parameters';
import { addDays, dayRange, parseDay } from '../lib/dates';
import { weekStart } from '../lib/periods';
import { periodBreakdown, type PeriodInput, type PeriodResult } from '../model/period';
import type { GaugeKind, GaugeStatus } from '../model/simulate';
import type { InsightData } from './insights';

/** Weeks in the charts, the shown week included. */
export const WEEKS_SHOWN = 8;

export interface Week {
  /** Monday. */
  from: string;
  /** Sunday, or yesterday for the week in progress: today is not over, so its totals are not yet a day's. */
  to: string;
}

/** `count` weeks ending with the week that starts on `monday`, oldest first. On a Monday the current week has no finished day yet (`to` before `from`). */
export function weeksEndingAt(monday: string, count: number, today: string): Week[] {
  const yesterday = addDays(today, -1);
  const out: Week[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = addDays(monday, -7 * i);
    const sunday = addDays(from, 6);
    out.push({ from, to: sunday > yesterday ? yesterday : sunday });
  }
  return out;
}

/** The week the look-back opens on: this week, or last week while this one has no finished day (on Mondays). */
export function defaultWeek(today: string): string {
  const monday = weekStart(today);
  return monday === today ? addDays(monday, -7) : monday;
}

export function weekPeriods(input: Omit<PeriodInput, 'from' | 'to'>, weeks: readonly Week[]): PeriodResult[] {
  return weeks.map((w) => periodBreakdown({ ...input, from: w.from, to: w.to }));
}

export interface NutrientWeeks {
  id: string;
  kind: GaugeKind;
  status: GaugeStatus;
  /** The shown week's value (as the Review screen shows it), null without a counted day. */
  value: number | null;
  /** The week before. */
  prev: number | null;
  prevStatus: GaugeStatus | null;
  /** One value per week, oldest first, the shown week last. */
  series: Array<number | null>;
}

/** Per nutrient: the shown week (the last period), the week before and the series for the chart. */
export function nutrientWeeks(periods: readonly PeriodResult[]): Map<string, NutrientWeeks> {
  const out = new Map<string, NutrientWeeks>();
  const last = periods[periods.length - 1];
  if (!last) return out;
  const before = periods[periods.length - 2];
  const valueIn = (p: PeriodResult | undefined, id: string) => (p && p.countedDays > 0 ? (p.nutrients.get(id)?.value.central ?? null) : null);
  for (const [id, r] of last.nutrients) {
    const prev = valueIn(before, id);
    out.set(id, {
      id,
      kind: r.kind,
      status: r.status,
      value: valueIn(last, id),
      prev,
      prevStatus: prev === null ? null : (before!.nutrients.get(id)?.status ?? null),
      series: periods.map((p) => valueIn(p, id)),
    });
  }
  return out;
}

export interface WeekRecap {
  /** Low or getting low the week before, enough this week. */
  closed: string[];
  /** Enough the week before, low or getting low this week. */
  opened: string[];
  /** Over the limit this week. */
  tooHigh: string[];
  /**
   * The biggest rise and fall in share of the need since the week before (at least the "steady" step),
   * with both weeks' values. Ranked on values capped at the need: above it, more closes no gap, so
   * 60 % → 100 % is a bigger rise than 130 % → 300 %.
   */
  improved?: { id: string; change: number; from: number; to: number };
  dropped?: { id: string; change: number; from: number; to: number };
}

const isGap = (s: GaugeStatus | null) => s === 'low' || s === 'gettingLow';
/** 100 % of the need. */
const NEED = 1;

/** What changed since the week before. Nutrients in `hidden` are left out. */
export function weekRecap(rows: ReadonlyMap<string, NutrientWeeks>, hidden: ReadonlySet<string> = new Set()): WeekRecap {
  const recap: WeekRecap = { closed: [], opened: [], tooHigh: [] };
  // Smaller moves read as steady, as for the trend arrows on Home.
  const minStep = trendDisplay.steadyPerWeek.value;
  for (const r of rows.values()) {
    if (hidden.has(r.id) || r.value === null) continue;
    if (r.status === 'tooHigh') recap.tooHigh.push(r.id);
    if (r.kind !== 'rolling' || r.prev === null) continue;
    if (isGap(r.prevStatus) && r.status === 'fine') recap.closed.push(r.id);
    if (r.prevStatus === 'fine' && isGap(r.status)) recap.opened.push(r.id);
    const change = Math.min(r.value, NEED) - Math.min(r.prev, NEED);
    const move = { id: r.id, change, from: r.prev, to: r.value };
    if (change >= minStep && change > (recap.improved?.change ?? 0)) recap.improved = move;
    if (change <= -minStep && change < (recap.dropped?.change ?? 0)) recap.dropped = move;
  }
  return recap;
}

/** A nutrient that moved since the week before: values as shares (1 = the need or the maximum). */
export interface WeekMove {
  id: string;
  kind: GaugeKind;
  from: number;
  to: number;
  /** Positive is better: a need counted up to 100 %, a limit only above it. */
  change: number;
}

/**
 * "Got better" and "Got worse" (design 2026-10-22, "A week"): the biggest moves since the week
 * before, at least the "steady" step, `n` each. A need counts up to 100 % (more closes no gap); a
 * limit counts only above 100 %, and rising there is worse.
 */
export function weekMoves(rows: ReadonlyMap<string, NutrientWeeks>, hidden: ReadonlySet<string> = new Set(), n = 3): { better: WeekMove[]; worse: WeekMove[] } {
  const minStep = trendDisplay.steadyPerWeek.value;
  const moves: WeekMove[] = [];
  for (const r of rows.values()) {
    if (hidden.has(r.id) || r.value === null || r.prev === null || r.kind === 'info') continue;
    const change = r.kind === 'limit' ? Math.max(r.prev, NEED) - Math.max(r.value, NEED) : Math.min(r.value, NEED) - Math.min(r.prev, NEED);
    if (Math.abs(change) >= minStep) moves.push({ id: r.id, kind: r.kind, from: r.prev, to: r.value, change });
  }
  return {
    better: moves
      .filter((m) => m.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, n),
    worse: moves
      .filter((m) => m.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, n),
  };
}

/**
 * The nutrients worth a small chart of their weeks: what got worse first, then what is low, a bit
 * low or over the limit this week, most urgent first; `n` at most.
 */
export function weekWatch(rows: ReadonlyMap<string, NutrientWeeks>, worse: readonly WeekMove[], hidden: ReadonlySet<string> = new Set(), n = 6): string[] {
  const rank: Partial<Record<GaugeStatus, number>> = { low: 0, tooHigh: 1, gettingLow: 2 };
  const out = worse.map((m) => m.id);
  const rest = [...rows.values()]
    .filter((r) => !hidden.has(r.id) && r.value !== null && rank[r.status] !== undefined && !out.includes(r.id))
    .sort((a, b) => rank[a.status]! - rank[b.status]! || (a.value ?? 0) - (b.value ?? 0));
  return [...out, ...rest.map((r) => r.id)].slice(0, n);
}

/** ISO 8601 week number of a day (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(day: string): number {
  const thursday = parseDay(addDays(weekStart(day), 3));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  return Math.floor(Math.round((thursday.getTime() - jan1.getTime()) / 86_400_000) / 7) + 1;
}

/** How the days of a week add up for a tracker: the average over days with a value, or their total. */
type Aggregate = 'mean' | 'sum';

export interface TrackerDef {
  /** A measure id from logic/insights.ts. */
  id: string;
  aggregate: Aggregate;
}

export const TRACKERS: readonly TrackerDef[] = [
  { id: 'sleep_hours', aggregate: 'mean' },
  { id: 'bedtime', aggregate: 'mean' },
  { id: 'wake_time', aggregate: 'mean' },
  { id: 'activity_minutes', aggregate: 'sum' },
  { id: 'hard_minutes', aggregate: 'sum' },
  { id: 'outside_minutes', aggregate: 'sum' },
  { id: 'plain_water', aggregate: 'mean' },
  { id: 'total_water', aggregate: 'mean' },
  { id: 'first_meal', aggregate: 'mean' },
  { id: 'last_meal', aggregate: 'mean' },
  { id: 'alcohol', aggregate: 'mean' },
  { id: 'journal_entries', aggregate: 'sum' },
];

export interface TrackerWeeks {
  id: string;
  aggregate: Aggregate;
  value: number | null;
  prev: number | null;
  /** Days of the shown week with a value. */
  days: number;
  series: Array<number | null>;
}

/** One tracker over one week: null when no day of it has a value (not tracked yet is not zero). */
export function trackerWeek(def: TrackerDef, data: InsightData, week: Week): { value: number | null; days: number } {
  const values: number[] = [];
  for (const day of dayRange(week.from, week.to)) {
    const v = data.days.get(day)?.values[def.id];
    if (v !== null && v !== undefined) values.push(v);
  }
  if (values.length === 0) return { value: null, days: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { value: def.aggregate === 'sum' ? sum : sum / values.length, days: values.length };
}

/** Every tracker with a value in any of the weeks; the last week is the shown one. */
export function trackerWeeks(data: InsightData, weeks: readonly Week[], defs: readonly TrackerDef[] = TRACKERS): TrackerWeeks[] {
  const out: TrackerWeeks[] = [];
  for (const def of defs) {
    const per = weeks.map((w) => trackerWeek(def, data, w));
    if (per.every((p) => p.value === null)) continue;
    out.push({
      id: def.id,
      aggregate: def.aggregate,
      value: per[per.length - 1]?.value ?? null,
      prev: per[per.length - 2]?.value ?? null,
      days: per[per.length - 1]?.days ?? 0,
      series: per.map((p) => p.value),
    });
  }
  return out;
}
