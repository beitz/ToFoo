/**
 * Sleep records (docs/SPEC.md, "Sleep"): pure helpers for the morning question, overlaps and
 * durations. Times are epoch ms; days are local YYYY-MM-DD keys.
 */
import { dayKey } from '../lib/dates';
import type { SleepRecord } from '../storage/types';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Longest plausible single sleep; anything longer is a forgotten "I'm up" or a typo. */
export const MAX_SLEEP_MS = 20 * HOUR;
/** Shorter sleeps are naps: they do not count as the night, nor toward the usual times. */
export const NIGHT_MIN_MS = 3 * HOUR;
/** Nights looked at for the usual bed and wake times. */
const USUAL_NIGHTS = 14;

export type SleepSpan = { start: number; end?: number };

/** The day a sleep belongs to: the day it ended (or started, while still asleep). */
export function sleepDay(s: SleepSpan): string {
  return dayKey(new Date(s.end ?? s.start));
}

export function duration(s: { start: number; end: number }): number {
  return Math.max(0, s.end - s.start);
}

/** Whether two sleeps overlap; a sleep still going counts as lasting up to the longest plausible sleep. */
export function overlaps(a: SleepSpan, b: SleepSpan): boolean {
  const aEnd = a.end ?? a.start + MAX_SLEEP_MS;
  const bEnd = b.end ?? b.start + MAX_SLEEP_MS;
  return a.start < bEnd && b.start < aEnd;
}

/** Minutes after local midnight. */
function minuteOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * Usual bed and wake times (minutes after midnight) from the last two weeks of nights, or undefined
 * without any. Bed times are compared from noon, so 23:30 and 00:30 average to midnight, not noon.
 */
export function usualTimes(records: SleepRecord[]): { bed: number; wake: number } | undefined {
  const nights = records
    .filter((r): r is SleepRecord & { end: number } => r.end !== undefined && duration(r as { start: number; end: number }) >= NIGHT_MIN_MS)
    .sort((a, b) => b.end - a.end)
    .slice(0, USUAL_NIGHTS);
  if (nights.length === 0) return undefined;
  const fromNoon = (m: number) => (m + 12 * 60) % (24 * 60);
  const bed = (median(nights.map((n) => fromNoon(minuteOfDay(n.start)))) + 12 * 60) % (24 * 60);
  return { bed, wake: median(nights.map((n) => minuteOfDay(n.end))) };
}

/** At `minutes` after midnight on the local day of `t`. */
function atMinute(t: number, minutes: number): number {
  const d = new Date(t);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

/** Without any nights logged yet, the question starts from a common night; the user adjusts it. */
const FALLBACK = { bed: 23 * 60, wake: 7 * 60 };

/**
 * What the morning question proposes: the sleep still going (from "Going to sleep") until now, or
 * last night at the usual times. Undefined when last night is already logged.
 */
export function morningGuess(records: SleepRecord[], now: number): { start: number; end: number; open?: SleepRecord } | undefined {
  const open = records.find((r) => r.end === undefined);
  if (open) return { start: open.start, end: Math.max(open.start, now), open };
  const today = dayKey(new Date(now));
  if (records.some((r) => r.day === today && r.end !== undefined && duration(r as { start: number; end: number }) >= NIGHT_MIN_MS)) return undefined;
  const usual = usualTimes(records) ?? FALLBACK;
  const end = Math.min(atMinute(now, usual.wake), now);
  let start = atMinute(end, usual.bed);
  if (start >= end) start -= 24 * HOUR;
  return { start, end };
}

/** Hours and minutes of a duration, rounded to the minute. */
export function hoursMinutes(ms: number): { h: number; m: number } {
  const total = Math.round(ms / MIN);
  return { h: Math.floor(total / 60), m: total % 60 };
}
