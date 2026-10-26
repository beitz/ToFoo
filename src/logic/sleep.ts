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
/** Sleeps less awake time apart than this are one night: waking up in the night, then sleeping again. */
export const NIGHT_GAP_MS = 3 * HOUR;
/** A sleep logged after another starts this long after it: falling asleep again takes a while (the user adjusts it). */
export const FOLLOW_ON_MS = 30 * MIN;
/** Length of a new sleep proposed with nothing else to go on, and how far back a new sleep looks for one it follows. */
export const NEW_SLEEP_MS = 8 * HOUR;

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

type Finished = SleepRecord & { end: number };

const finished = (records: readonly SleepRecord[]): Finished[] => records.filter((r): r is Finished => r.end !== undefined);

/** Sleeps joined into one stretch: from the first falling asleep to the last waking up, with the time actually asleep. */
export type SleepBlock = { start: number; end: number; asleep: number; parts: Finished[] };

/**
 * Finished sleeps joined into blocks, oldest first: sleeps less than NIGHT_GAP_MS apart are one block,
 * so a night with waking up in between counts as one night. A block with NIGHT_MIN_MS or more of sleep
 * is a night (it belongs to the day it ended); the parts of a shorter one are naps.
 */
export function sleepBlocks(records: readonly SleepRecord[]): SleepBlock[] {
  const blocks: SleepBlock[] = [];
  for (const r of finished(records).sort((a, b) => a.start - b.start)) {
    const last = blocks[blocks.length - 1];
    if (last && r.start - last.end < NIGHT_GAP_MS) {
      last.end = Math.max(last.end, r.end);
      last.asleep += duration(r);
      last.parts.push(r);
    } else blocks.push({ start: r.start, end: r.end, asleep: duration(r), parts: [r] });
  }
  return blocks;
}

export const isNight = (b: SleepBlock): boolean => b.asleep >= NIGHT_MIN_MS;

/** A day's sleep: the night that ended on it (if any) and its naps, oldest first. */
export type DaySleep = { night?: SleepBlock; naps: SleepBlock[] };

/**
 * Every sleep by the day it ended, as in the diary and the calendar (owner's report 2026-10-24: a
 * midday nap showed in the diary but not here): night blocks ending the same day count as one night,
 * and naps count to their day too. Only a night makes a day logged, so a day with just a nap stays unknown.
 */
export function sleepByDay(records: readonly SleepRecord[]): Map<string, DaySleep> {
  const out = new Map<string, DaySleep>();
  for (const b of sleepBlocks(records)) {
    const day = dayKey(new Date(b.end));
    const had = out.get(day) ?? { naps: [] };
    if (!isNight(b)) had.naps.push(b);
    else if (!had.night) had.night = b;
    else had.night = { start: Math.min(had.night.start, b.start), end: Math.max(had.night.end, b.end), asleep: had.night.asleep + b.asleep, parts: [...had.night.parts, ...b.parts] };
    out.set(day, had);
  }
  return out;
}

/**
 * Waking up within a stretch of sleep: how often and for how long in all, from the gaps between its
 * parts (overlapping parts leave no gap).
 */
export function wakeUps(b: SleepBlock): { count: number; awake: number } {
  let count = 0;
  let awake = 0;
  let end: number | undefined;
  for (const p of [...b.parts].sort((x, y) => x.start - y.start)) {
    if (end !== undefined && p.start > end) {
      count++;
      awake += p.start - end;
    }
    end = end === undefined ? p.end : Math.max(end, p.end);
  }
  return { count, awake };
}

/** The latest finished sleep that ended by `now`. */
function lastFinished(records: readonly SleepRecord[], now: number): Finished | undefined {
  return finished(records)
    .filter((r) => r.end <= now)
    .reduce<Finished | undefined>((a, r) => (!a || r.end > a.end ? r : a), undefined);
}

/**
 * A sleep added now, right after another (several sleeps a night, owner's ask 2026-10-22): when a sleep
 * ended less than NEW_SLEEP_MS ago, from FOLLOW_ON_MS after it until now, so the proposal does not run
 * into it. Undefined otherwise.
 */
export function followOnSleep(records: readonly SleepRecord[], now: number): { start: number; end: number } | undefined {
  const last = lastFinished(records, now);
  if (!last || now - last.end >= NEW_SLEEP_MS) return undefined;
  // Woken up less than half an hour ago: start right where the last one ended.
  return { start: now - last.end > FOLLOW_ON_MS ? last.end + FOLLOW_ON_MS : last.end, end: now };
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
  const nights = sleepBlocks(records)
    .filter(isNight)
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
 * last night at the usual times. When part of last night is logged (woke up in the night), it asks
 * about the rest: from half an hour after that part until the usual wake time, if a night's worth is
 * left. Undefined when last night is already logged.
 */
export function morningGuess(records: SleepRecord[], now: number): { start: number; end: number; open?: SleepRecord } | undefined {
  const open = records.find((r) => r.end === undefined);
  if (open) return { start: open.start, end: Math.max(open.start, now), open };
  const usual = usualTimes(records) ?? FALLBACK;
  const end = Math.min(atMinute(now, usual.wake), now);
  let start = atMinute(end, usual.bed);
  if (start >= end) start -= 24 * HOUR;
  const last = lastFinished(records, now);
  if (last && last.end > start) {
    const rest = { start: last.end + FOLLOW_ON_MS, end };
    return rest.end - rest.start >= NIGHT_MIN_MS ? rest : undefined;
  }
  const today = dayKey(new Date(now));
  if (sleepBlocks(records).some((b) => isNight(b) && dayKey(new Date(b.end)) === today)) return undefined;
  return { start, end };
}

/** Hours and minutes of a duration, rounded to the minute. */
export function hoursMinutes(ms: number): { h: number; m: number } {
  const total = Math.round(ms / MIN);
  return { h: Math.floor(total / 60), m: total % 60 };
}
