/**
 * Blood pressure (docs/SPEC.md, "Blood pressure"): pure helpers over the readings the user took.
 * The lines come from model/blood-pressure.ts; nothing here is a physiological number of its own.
 */
import { homeCategories, homeProtocol, low, veryHigh, type BpPair } from '../../model/blood-pressure';
import { addDays } from '../lib/dates';
import type { BloodPressureReading } from '../storage/types';

/**
 * Input checks against typos and swapped fields, not physiology: values outside these are sent back
 * (the sheet says so, the assistant gets an error) rather than saved.
 */
export const BP_INPUT = { systolic: [50, 280], diastolic: [25, 180], pulse: [25, 250] } as const;

/** Low < not raised < raised < high < very high; names in the UI are words, never colour alone. */
export const BP_CATEGORIES = ['low', 'notRaised', 'raised', 'high', 'veryHigh'] as const;
export type BpCategory = (typeof BP_CATEGORIES)[number];

/** The category of an average (or, for "very high" and "low", of one reading); either number moves it up. */
export function bpCategory({ systolic, diastolic }: BpPair): BpCategory {
  const over = (line: BpPair) => systolic >= line.systolic || diastolic >= line.diastolic;
  if (over(veryHigh.value)) return 'veryHigh';
  if (over(homeCategories.value.highFrom)) return 'high';
  if (over(homeCategories.value.raisedFrom)) return 'raised';
  if (systolic < low.value.systolic || diastolic < low.value.diastolic) return 'low';
  return 'notRaised';
}

/** What is wrong with a typed reading, or undefined when it can be saved. */
export function bpProblem(r: { systolic?: number; diastolic?: number; pulse?: number }): 'empty' | 'systolic' | 'diastolic' | 'pulse' | 'order' | undefined {
  if (r.systolic === undefined || r.diastolic === undefined) return 'empty';
  const inside = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
  if (!inside(r.systolic, BP_INPUT.systolic)) return 'systolic';
  if (!inside(r.diastolic, BP_INPUT.diastolic)) return 'diastolic';
  if (r.pulse !== undefined && !inside(r.pulse, BP_INPUT.pulse)) return 'pulse';
  if (r.systolic <= r.diastolic) return 'order';
  return undefined;
}

export interface BpAverage extends BpPair {
  /** Average pulse of the readings that have one; undefined when none has. */
  pulse?: number;
  readings: number;
  days: number;
}

/** The average of the readings (rounded to whole mmHg); undefined when there are none. */
export function bpAverage(readings: readonly Pick<BloodPressureReading, 'systolic' | 'diastolic' | 'pulse' | 'day'>[]): BpAverage | undefined {
  if (!readings.length) return undefined;
  const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const pulses = readings.flatMap((r) => (r.pulse !== undefined ? [r.pulse] : []));
  return {
    systolic: mean(readings.map((r) => r.systolic)),
    diastolic: mean(readings.map((r) => r.diastolic)),
    ...(pulses.length ? { pulse: mean(pulses) } : {}),
    readings: readings.length,
    days: new Set(readings.map((r) => r.day)).size,
  };
}

/** The readings of the `days` days ending today (today included: a reading counts once taken). */
export function bpInWindow<T extends Pick<BloodPressureReading, 'day'>>(readings: readonly T[], today: string, days: number = homeProtocol.value.days): T[] {
  const from = addDays(today, -(days - 1));
  return readings.filter((r) => r.day >= from && r.day <= today);
}

/** The average the ESH protocol asks for: the last 7 days; `enough` once it covers at least 3 days. */
export function bpWeek(readings: readonly BloodPressureReading[], today: string): { average?: BpAverage; enough: boolean } {
  const average = bpAverage(bpInWindow(readings, today));
  return { average, enough: !!average && average.days >= homeProtocol.value.minDays };
}

/**
 * Morning or evening, for the split the protocol measures in. A display split at noon, not a
 * physiological line: the protocol's morning is after getting up, its evening before going to bed.
 */
export const EVENING_FROM_HOUR = 12;
export const partOfDay = (time: number): 'morning' | 'evening' => (new Date(time).getHours() < EVENING_FROM_HOUR ? 'morning' : 'evening');

/** The average of each day with readings. */
export function bpByDay(readings: readonly BloodPressureReading[]): Map<string, BpAverage> {
  const groups = new Map<string, BloodPressureReading[]>();
  for (const r of readings) groups.set(r.day, [...(groups.get(r.day) ?? []), r]);
  return new Map([...groups].map(([day, rs]) => [day, bpAverage(rs)!]));
}

/** The newest reading when it is very high (measure again; see a doctor if it stays), else undefined. */
export function lastVeryHigh(readings: readonly BloodPressureReading[]): BloodPressureReading | undefined {
  const last = readings.reduce<BloodPressureReading | undefined>((a, r) => (!a || bySittingOrder(r, a) > 0 ? r : a), undefined);
  return last && bpCategory(last) === 'veryHigh' ? last : undefined;
}

/**
 * A reading as it is being typed in, with when its numbers were filled in: `pairAt` when systolic
 * and diastolic first both had a value, `allAt` when the pulse had one too (owner's ask 2026-11-23:
 * a time per reading, to spot problems with the order).
 */
export interface TypedReading {
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  pairAt?: number;
  allAt?: number;
}

/**
 * `next` (a typed reading after a change) with its stamps set at `now` the first time it fills up.
 * Fixing a typo keeps the first stamp; emptying the row starts it over.
 */
export function stampReading<T extends TypedReading>(next: T, now: number): T {
  const { pairAt: _p, allAt: _a, ...rest } = next;
  if (next.systolic === undefined && next.diastolic === undefined && next.pulse === undefined) return rest as T;
  const pair = next.systolic !== undefined && next.diastolic !== undefined;
  const pairAt = next.pairAt ?? (pair ? now : undefined);
  const allAt = next.allAt ?? (pair && next.pulse !== undefined ? now : undefined);
  return { ...rest, ...(pairAt !== undefined ? { pairAt } : {}), ...(allAt !== undefined ? { allAt } : {}) } as T;
}

/**
 * How far a stamp may lie from the sitting's time and still be kept. A UI rule, not physiology:
 * readings typed in at the sitting are kept; a sitting logged afterwards (from the diary, the
 * catch-up page, or with the time moved back) was typed long after it was measured, when the typing
 * time says nothing about the order.
 */
export const STAMP_NEAR_MS = 60 * 60_000;

/** When the reading's numbers were filled in, if that was at the sitting `time`; else undefined. */
export function enteredAtFor(r: TypedReading, time: number): number | undefined {
  const at = r.allAt ?? r.pairAt;
  return at !== undefined && Math.abs(at - time) <= STAMP_NEAR_MS ? at : undefined;
}

/** Oldest first: by the sitting's time, then by when each reading was filled in. */
export function bySittingOrder(a: Pick<BloodPressureReading, 'time' | 'enteredAt'>, b: Pick<BloodPressureReading, 'time' | 'enteredAt'>): number {
  return a.time - b.time || (a.enteredAt ?? 0) - (b.enteredAt ?? 0);
}

/** The readings grouped by sitting (the same `time`), oldest first, each sitting in the order taken. */
export function bpSittings<T extends Pick<BloodPressureReading, 'time' | 'enteredAt'>>(readings: readonly T[]): T[][] {
  const out: T[][] = [];
  for (const r of [...readings].sort(bySittingOrder)) {
    const last = out[out.length - 1];
    if (last && last[0]!.time === r.time) last.push(r);
    else out.push([r]);
  }
  return out;
}
