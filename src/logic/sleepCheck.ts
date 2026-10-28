/**
 * Sleep against the norms (docs/SPEC.md, "Sleep knowledge for the assistant"): the user's nights
 * counted against the sourced lines in model/sleep.ts, for the assistant's sleep_check tool. The
 * assistant picks the period and, for caffeine, the food words; the app does the counting, and marks
 * the lines crossed often enough to be worth mentioning. Pure: tested in sleepCheck.test.ts.
 */
import { caffeineGapHours, napLines, oftenNights, sleepDuration, sleepQuality } from '../../model/sleep';
import { normalize } from '../foods/search';
import { dayKey } from '../lib/dates';
import { hasWord, periodDays, type DayFacts, type InsightData, type SleepProfile } from './insights';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Nights on the good side of a line, in the panel's uncertain middle, and on the poor side. */
export interface Bands {
  good: number;
  between: number;
  poor: number;
}

export interface Spread {
  median: number;
  /** Standard deviation, in the same unit (hours). */
  sd: number;
}

/** A line crossed on enough nights to be worth mentioning (model/sleep.ts `oftenNights`). */
export type StandOutLine = 'underNeed' | 'tooShort' | 'tooLong' | 'wakeUps' | 'awake' | 'share' | 'longNaps' | 'caffeine';

export interface StandOut {
  line: StandOutLine;
  count: number;
  of: number;
}

export interface SleepCheck {
  days: number;
  profile: SleepProfile;
  /** Nights logged in the period. */
  nights: number;
  /** Average hours asleep and nights under the need, below the panel's "not recommended" line and above it. */
  length?: { mean: number; underNeed: number; tooShort: number; tooLong: number };
  wakeUps: Bands;
  /** `poor` stays 0 where the panel agreed on no poor line (from 65). */
  awake: Bands;
  /** Asleep as a share of first asleep to last up, in %. */
  share: Bands & { mean?: number };
  /** Clock hours: first asleep counted from the evening before (24.5 = 00:30), up on the morning (7.25 = 07:15). */
  timing?: { bed: Spread; up: Spread; weekend?: { shiftMinutes: number; nights: number; otherNights: number } };
  naps: { trackedDays: number; napDays: number; longDays: number; tooLong: number; many: number };
  /** Only when the assistant gave words to find caffeine by. */
  caffeine?: { words: string[]; known: number; within: number; none: number; medianGapHours?: number };
  standsOut: StandOut[];
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: readonly number[]): Spread => {
  const m = mean(xs);
  return { median: median(xs), sd: Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) };
};

/** Gaps between the parts of a night longer than `minMs` (overlapping parts leave no gap). */
function longWakeUps(parts: ReadonlyArray<{ start: number; end: number }>, minMs: number): number {
  let n = 0;
  let end: number | undefined;
  for (const p of [...parts].sort((a, b) => a.start - b.start)) {
    if (end !== undefined && p.start - end > minMs) n++;
    end = end === undefined ? p.end : Math.max(end, p.end);
  }
  return n;
}

function band(value: number, goodMax: number, poorMin: number | null): keyof Bands {
  return value <= goodMax ? 'good' : poorMin !== null && value >= poorMin ? 'poor' : 'between';
}

/**
 * Hours from the last food matching `words` to falling asleep, within the 24 hours before: a number,
 * 'none' when the food log of those hours is complete and has none, undefined when it cannot be told.
 */
function caffeineGap(start: number, words: readonly string[], data: InsightData): number | 'none' | undefined {
  const from = start - 24 * HOUR;
  const days = [...new Set([dayKey(new Date(from)), dayKey(new Date(start - 1))])].map((k) => data.days.get(k));
  let last: number | undefined;
  for (const f of days)
    for (const e of f?.entries ?? []) if (e.time >= from && e.time < start && hasWord(e.text ?? ` ${normalize(e.label)} `, words)) last = Math.max(last ?? 0, e.time);
  if (last !== undefined) return (start - last) / HOUR;
  return days.every((f) => f?.foodComplete) ? 'none' : undefined;
}

/** The user's nights from `from` to `to` against the lines for their age group. */
export function sleepCheck(data: InsightData, from: string, to: string, profile: SleepProfile, caffeineWords: readonly string[] = []): SleepCheck {
  const g = profile.ageGroup;
  const dur = sleepDuration.value;
  const q = sleepQuality;
  const days = periodDays(data, from, to)
    .map((d) => data.days.get(d))
    .filter((f): f is DayFacts => !!f);
  const nights = days.filter((f): f is DayFacts & { night: NonNullable<DayFacts['night']> } => !!f.night);

  const wakeUps: Bands = { good: 0, between: 0, poor: 0 };
  const awake: Bands = { good: 0, between: 0, poor: 0 };
  const share: Bands = { good: 0, between: 0, poor: 0 };
  const hours: number[] = [];
  const shares: number[] = [];
  const beds: number[] = [];
  const ups: number[] = [];
  const mids: Array<{ weekend: boolean; mid: number }> = [];
  for (const f of nights) {
    const h = f.values.sleep_hours ?? 0;
    hours.push(h);
    wakeUps[band(longWakeUps(f.night.parts, q.awakenings.value.minMinutes * MIN), q.awakenings.value.goodMax[g], q.awakenings.value.poorMin)]++;
    awake[band(f.values.awake_minutes ?? 0, q.awakeMinutes.value.goodMax, q.awakeMinutes.value.poorMin[g])]++;
    const span = (f.night.end - f.night.start) / HOUR;
    if (span > 0) {
      const pct = (100 * h) / span;
      shares.push(pct);
      // Higher is better here, so the bands run the other way.
      share[pct >= q.efficiency.value.goodMin ? 'good' : pct <= q.efficiency.value.poorMax[g] ? 'poor' : 'between']++;
    }
    const bed = f.values.bedtime;
    const up = f.values.wake_time;
    if (bed !== null && bed !== undefined && up !== null && up !== undefined) {
      beds.push(bed);
      ups.push(up);
      mids.push({ weekend: f.weekday === 0 || f.weekday === 6, mid: (bed + up + 24) / 2 });
    }
  }

  const tracked = days.filter((f) => f.values.nap_minutes !== null && f.values.nap_minutes !== undefined);
  const naps = {
    trackedDays: tracked.length,
    napDays: tracked.filter((f) => f.naps.length > 0).length,
    longDays: tracked.filter((f) => (f.values.nap_minutes ?? 0) >= napLines.longMinutes.value).length,
    tooLong: tracked.filter((f) => f.naps.some((n) => n.end - n.start > napLines.tooLongMinutes.value * MIN)).length,
    many: tracked.filter((f) => f.naps.length >= napLines.manyPerDay.value).length,
  };

  const words = caffeineWords.filter((w) => w.trim());
  let caffeine: SleepCheck['caffeine'];
  if (words.length) {
    const gaps = nights.map((f) => caffeineGap(f.night.start, words, data)).filter((x) => x !== undefined);
    const hoursBefore = gaps.filter((x): x is number => typeof x === 'number');
    caffeine = {
      words,
      known: gaps.length,
      within: hoursBefore.filter((x) => x < caffeineGapHours.value).length,
      none: gaps.length - hoursBefore.length,
      ...(hoursBefore.length ? { medianGapHours: median(hoursBefore) } : {}),
    };
  }

  const length = hours.length
    ? {
        mean: mean(hours),
        underNeed: hours.filter((h) => h < profile.needHours).length,
        tooShort: hours.filter((h) => h < dur.notBelow[g]).length,
        tooLong: hours.filter((h) => h > dur.notAbove[g]).length,
      }
    : undefined;

  const weekend = mids.filter((m) => m.weekend);
  const weekdays = mids.filter((m) => !m.weekend);
  const timing = beds.length
    ? {
        bed: spread(beds),
        up: spread(ups),
        ...(weekend.length && weekdays.length
          ? { weekend: { shiftMinutes: (median(weekend.map((m) => m.mid)) - median(weekdays.map((m) => m.mid))) * 60, nights: weekend.length, otherNights: weekdays.length } }
          : {}),
      }
    : undefined;

  const { perWeek, minNights } = oftenNights.value;
  const standsOut: StandOut[] = [];
  const often = (line: StandOutLine, count: number, of: number) => {
    if (of >= minNights && count * 7 >= perWeek * of) standsOut.push({ line, count, of });
  };
  if (length) {
    often('underNeed', length.underNeed, nights.length);
    often('tooShort', length.tooShort, nights.length);
    often('tooLong', length.tooLong, nights.length);
  }
  often('wakeUps', wakeUps.poor, nights.length);
  often('awake', awake.poor, nights.length);
  often('share', share.poor, shares.length);
  often('longNaps', naps.longDays, naps.trackedDays);
  if (caffeine) often('caffeine', caffeine.within, caffeine.known);

  return {
    days: days.length,
    profile,
    nights: nights.length,
    ...(length ? { length } : {}),
    wakeUps,
    awake,
    share: { ...share, ...(shares.length ? { mean: mean(shares) } : {}) },
    ...(timing ? { timing } : {}),
    naps,
    ...(caffeine ? { caffeine } : {}),
    standsOut,
  };
}
