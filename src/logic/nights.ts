/**
 * The sleep page (design 2026-10-22, "Sleep"): nights over a window, debt against the sleep need,
 * usual times with their spread, and weekly averages. Pure, tested in nights.test.ts. Unlogged
 * nights are unknown, never zero: they stay out of every sum and average.
 */
import { addDays } from '../lib/dates';
import { weekStart } from '../lib/periods';
import type { SleepRecord } from '../storage/types';
import { sleepByDay, type DaySleep, type SleepBlock } from './sleep';

const MIN = 60_000;
const DAY_MIN = 24 * 60;

export interface Night {
  /** The day the night ended (the morning after). */
  day: string;
  /** Undefined when no night was logged: unknown, not zero. */
  block?: SleepBlock;
  /** Naps that ended on this day (sleeps not part of a night), oldest first. */
  naps: SleepBlock[];
  /** Minutes asleep that day, the night and its naps together; undefined without a night. */
  asleep?: number;
  /** Minutes over (+) or under (−) the need. */
  diff?: number;
}

/** Milliseconds asleep on a day: the night and its naps; undefined without a night. */
const dayAsleep = (s: DaySleep | undefined): number | undefined => (s?.night ? s.naps.reduce((n, b) => n + b.asleep, s.night.asleep) : undefined);

/**
 * The last `count` nights, oldest first, ending with last night (today's morning) once it is
 * logged and with the night before otherwise, so a morning not logged yet never shows as a gap.
 */
export function nightsWindow(records: readonly SleepRecord[], today: string, count: number, needMinutes: number): Night[] {
  const byDay = sleepByDay(records);
  const last = byDay.get(today)?.night ? today : addDays(today, -1);
  const out: Night[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = addDays(last, -i);
    const s = byDay.get(day);
    const ms = dayAsleep(s);
    if (ms === undefined) out.push({ day, naps: s?.naps ?? [] });
    else {
      const asleep = Math.round(ms / MIN);
      out.push({ day, block: s!.night, naps: s!.naps, asleep, diff: asleep - needMinutes });
    }
  }
  return out;
}

export interface Debt {
  /** Minutes over (+) or under (−) the need, added up over the logged nights. */
  balance: number;
  /** The running balance after each night (unchanged over an unlogged one), oldest first. */
  running: number[];
  /** Change over the last 7 nights. */
  lastWeek: number;
  logged: number;
  /** Average minutes asleep over the logged nights; undefined without any. */
  average?: number;
}

/** Sleep debt: each logged night minus the need, added up. Plain arithmetic, nothing physiological. */
export function sleepDebt(nights: readonly Night[]): Debt {
  let balance = 0;
  const running: number[] = [];
  for (const n of nights) {
    balance += n.diff ?? 0;
    running.push(balance);
  }
  const lastWeek = nights.slice(-7).reduce((s, n) => s + (n.diff ?? 0), 0);
  const logged = nights.filter((n) => n.asleep !== undefined);
  const average = logged.length ? Math.round(logged.reduce((s, n) => s + n.asleep!, 0) / logged.length) : undefined;
  return { balance, running, lastWeek, logged: logged.length, ...(average !== undefined ? { average } : {}) };
}

/** Minutes after local midnight. */
export function minuteOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo));
}

/** A time of day over the nights: the median, the middle half and the whole range (minutes after midnight). */
export interface Spread {
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  /** Half the middle half, in minutes: "± 26 min". */
  plusMinus: number;
}

/**
 * The spread of clock times. `pivot` is where the day is cut, so times around midnight stay
 * together: falling asleep is counted from noon (23:30 and 00:30 are an hour apart, not 23).
 */
export function spreadOf(minutes: readonly number[], pivot: number): Spread | undefined {
  if (minutes.length === 0) return undefined;
  const shifted = minutes.map((m) => (m - pivot + DAY_MIN) % DAY_MIN).sort((a, b) => a - b);
  const back = (m: number) => (m + pivot) % DAY_MIN;
  const q1 = quantile(shifted, 0.25);
  const q3 = quantile(shifted, 0.75);
  return {
    median: back(quantile(shifted, 0.5)),
    q1: back(q1),
    q3: back(q3),
    min: back(shifted[0]!),
    max: back(shifted[shifted.length - 1]!),
    plusMinus: Math.round((q3 - q1) / 2),
  };
}

/** Falling asleep counted from noon, waking up from midnight. */
export const BED_PIVOT = 12 * 60;
export const WAKE_PIVOT = 0;

/** When the nights started and ended; naps leave the usual times alone. */
export function nightTimes(nights: readonly Night[]): { bed?: Spread; wake?: Spread } {
  const blocks = nights.flatMap((n) => (n.block ? [n.block] : []));
  return {
    bed: spreadOf(
      blocks.map((b) => minuteOfDay(b.start)),
      BED_PIVOT,
    ),
    wake: spreadOf(
      blocks.map((b) => minuteOfDay(b.end)),
      WAKE_PIVOT,
    ),
  };
}

/** Average minutes asleep (naps included) per logged night in each calendar week (Monday first), the last `count` weeks up to today's, oldest first. */
export function weeklySleep(records: readonly SleepRecord[], today: string, count: number): Array<{ monday: string; average?: number; nights: number }> {
  const byDay = sleepByDay(records);
  const out: Array<{ monday: string; average?: number; nights: number }> = [];
  const thisMonday = weekStart(today);
  for (let i = count - 1; i >= 0; i--) {
    const monday = addDays(thisMonday, -7 * i);
    const mins: number[] = [];
    for (let j = 0; j < 7; j++) {
      const ms = dayAsleep(byDay.get(addDays(monday, j)));
      if (ms !== undefined && addDays(monday, j) <= today) mins.push(ms / MIN);
    }
    out.push({ monday, nights: mins.length, ...(mins.length ? { average: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) } : {}) });
  }
  return out;
}

/** The start of the last meal in the 12 hours before falling asleep, if any. */
export function lastMealBefore(mealStarts: readonly number[], sleepStart: number): number | undefined {
  let best: number | undefined;
  for (const t of mealStarts) if (t <= sleepStart && t > sleepStart - 12 * 60 * MIN && (best === undefined || t > best)) best = t;
  return best;
}
