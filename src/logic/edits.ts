/**
 * Changing and deleting saved entries from the assistant's change (C) and delete (X) cards
 * (docs/SPEC.md, "Recent days and changing saved entries"). Pure: what an entry looks like with a
 * change applied; reading and writing them is the card's job.
 */
import { dayKey } from '../lib/dates';
import type { ActivityRecord, BloodPressureReading, HabitDay, HabitKind, Intensity, JournalEntry, KetoneReading, LogEntry, SleepRecord, WaterRecord } from '../storage/types';
import { sleepDay } from './sleep';

/** The kinds of saved entries the assistant can see in the recent days and change or delete. */
export const RECENT_KINDS = ['log', 'sleep', 'activity', 'water', 'weight', 'bloodPressure', 'ketone', 'habit', 'journal'] as const;
export type RecentKind = (typeof RECENT_KINDS)[number];

/** A weigh-in lives in the profile, one per day: the day is its id. */
export interface WeighIn {
  day: string;
  kg: number;
}

/** A saved entry of any kind the recent days hold; a habit answer carries its habit's name and kind. */
export type RecentRecord =
  | { kind: 'log'; rec: LogEntry }
  | { kind: 'journal'; rec: JournalEntry }
  | { kind: 'sleep'; rec: SleepRecord }
  | { kind: 'activity'; rec: ActivityRecord }
  | { kind: 'water'; rec: WaterRecord }
  | { kind: 'weight'; rec: WeighIn }
  | { kind: 'bloodPressure'; rec: BloodPressureReading }
  | { kind: 'ketone'; rec: KetoneReading }
  | { kind: 'habit'; rec: HabitDay; habit: { name: string; kind: HabitKind } };

export const recordId = (r: RecentRecord): string => (r.kind === 'weight' ? r.rec.day : r.rec.id);
export const recordDay = (r: RecentRecord): string => r.rec.day;

/** When an entry happened, for sorting within a day (a weigh-in or habit answer has only its day). */
export function recordTime(r: RecentRecord): number | undefined {
  switch (r.kind) {
    case 'sleep':
      return r.rec.start;
    case 'weight':
    case 'habit':
      return undefined;
    default:
      return r.rec.time;
  }
}

/**
 * What a change card sets; anything left out stays as it is. `time` is when it happened (an
 * activity's start), `start`/`end` a sleep's. `pulse` 0 takes the pulse off a reading.
 */
export interface EditPatch {
  time?: number;
  start?: number;
  end?: number;
  grams?: number;
  pieces?: number;
  portions?: number;
  servings?: number;
  minutes?: number;
  intensity?: Intensity;
  ml?: number;
  kg?: number;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  value?: number;
  text?: string;
  did?: boolean;
}

/** The fields of a patch each kind of entry can take (and, for the log, each kind of log entry). */
export function editableFields(r: RecentRecord): Array<keyof EditPatch> {
  switch (r.kind) {
    case 'log': {
      const e = r.rec;
      if (e.kind === 'food') return e.pieces ? ['time', 'grams', 'pieces'] : ['time', 'grams'];
      if (e.kind === 'portion') return e.grams ? ['time', 'grams'] : ['time', 'portions'];
      if (e.kind === 'custom') return ['time', 'servings'];
      return ['time'];
    }
    case 'journal':
      return ['time', 'text'];
    case 'sleep':
      return ['start', 'end'];
    case 'activity':
      return ['time', 'minutes', 'intensity'];
    case 'water':
      return ['time', 'ml'];
    case 'weight':
      return ['kg'];
    case 'bloodPressure':
      return ['time', 'systolic', 'diastolic', 'pulse'];
    case 'ketone':
      return ['time', 'value'];
    case 'habit':
      return ['did'];
  }
}

const withTime = <T extends { time: number; day: string }>(rec: T, time: number | undefined): T => (time === undefined ? rec : { ...rec, time, day: dayKey(new Date(time)) });

/** The entry with the change applied (fields its kind cannot take are ignored). The day follows the time. */
export function applyEdit(r: RecentRecord, p: EditPatch): RecentRecord {
  switch (r.kind) {
    case 'log': {
      const e = withTime(r.rec, p.time);
      if (e.kind === 'food') {
        // Pieces set the grams from the weight of one, as the entry had it; grams alone end the count.
        if (p.pieces !== undefined && e.pieces) {
          const grams = p.grams ?? Math.round(((e.grams / e.pieces) * p.pieces) * 10) / 10;
          return { kind: 'log', rec: { ...e, grams, pieces: p.pieces } };
        }
        if (p.grams !== undefined) {
          const { pieces: _pieces, ...rest } = e;
          return { kind: 'log', rec: { ...rest, grams: p.grams } };
        }
        return { kind: 'log', rec: e };
      }
      if (e.kind === 'portion') return { kind: 'log', rec: { ...e, ...(e.grams && p.grams !== undefined ? { grams: p.grams } : {}), ...(!e.grams && p.portions !== undefined ? { portions: p.portions } : {}) } };
      if (e.kind === 'custom') return { kind: 'log', rec: { ...e, ...(p.servings !== undefined ? { servings: p.servings } : {}) } };
      return { kind: 'log', rec: e };
    }
    case 'journal':
      return { kind: 'journal', rec: { ...withTime(r.rec, p.time), ...(p.text !== undefined ? { text: p.text } : {}) } };
    case 'sleep': {
      const start = p.start ?? r.rec.start;
      const end = p.end ?? r.rec.end;
      return { kind: 'sleep', rec: { ...r.rec, start, ...(end !== undefined ? { end } : {}), day: sleepDay({ start, ...(end !== undefined ? { end } : {}) }) } };
    }
    case 'activity':
      return { kind: 'activity', rec: { ...withTime(r.rec, p.time), ...(p.minutes !== undefined ? { minutes: p.minutes } : {}), ...(p.intensity ? { intensity: p.intensity } : {}) } };
    case 'water':
      return { kind: 'water', rec: { ...withTime(r.rec, p.time), ...(p.ml !== undefined ? { ml: p.ml } : {}) } };
    case 'weight':
      return { kind: 'weight', rec: { ...r.rec, ...(p.kg !== undefined ? { kg: p.kg } : {}) } };
    case 'bloodPressure': {
      const b = withTime(r.rec, p.time);
      const { pulse: _pulse, ...noPulse } = b;
      const pulse = p.pulse === undefined ? b.pulse : p.pulse || undefined;
      return {
        kind: 'bloodPressure',
        rec: { ...noPulse, ...(p.systolic !== undefined ? { systolic: p.systolic } : {}), ...(p.diastolic !== undefined ? { diastolic: p.diastolic } : {}), ...(pulse !== undefined ? { pulse } : {}) },
      };
    }
    case 'ketone':
      return { kind: 'ketone', rec: { ...withTime(r.rec, p.time), ...(p.value !== undefined ? { value: p.value } : {}) } };
    case 'habit':
      return { ...r, rec: { ...r.rec, ...(p.did !== undefined ? { did: p.did } : {}) } };
  }
}

/** Whether a change would leave the entry as it is (nothing to confirm). */
export function sameRecord(a: RecentRecord, b: RecentRecord): boolean {
  const canon = (o: object) => JSON.stringify(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
  return canon(a.rec) === canon(b.rec);
}
