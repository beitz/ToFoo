import { parseDay } from '../lib/dates';
import type { ActivityRecord, Intensity, SleepRecord, WaterRecord } from '../storage/types';
import { minuteOfDay } from './nights';
import { usualTimes } from './sleep';

/**
 * "Yesterday is missing…" (owner's ask, 2026-10-23: he kept forgetting to log his commute): what a
 * past day lacks among the things the user tracks, and quick ways to fill it in. Pure: the caller
 * passes the records and which trackers are on.
 */

export const CATCH_UP_KINDS = ['food', 'sleep', 'activity', 'water'] as const;
export type CatchUpKind = (typeof CATCH_UP_KINDS)[number];

export interface CatchUpInput {
  day: string;
  /** Trackers switched on in Settings (food is always tracked). */
  on: { sleep: boolean; activity: boolean; water: boolean };
  /** The day has no meals and no status (fasted, left out, …): the model's 'unknown'. */
  foodUnknown: boolean;
  /** The day is before the model starts: nothing to ask about food. */
  beforeStart: boolean;
  sleep: readonly Pick<SleepRecord, 'day' | 'end'>[];
  activities: readonly Pick<ActivityRecord, 'day'>[];
  water: readonly Pick<WaterRecord, 'day'>[];
  /** What the user already answered with "Skip" for this day. */
  skipped: ReadonlySet<CatchUpKind>;
}

/**
 * What `day` is missing, in a fixed order: every tracker that is on, even one never used yet (the
 * owner switched Activity on and expected the question; only one day is asked about, so a tracker
 * switched on today costs at most one Skip). A sleep counts for the day it ended on.
 */
export function missingOn(input: CatchUpInput): CatchUpKind[] {
  const { day } = input;
  const has = (rs: readonly { day: string }[]) => rs.some((r) => r.day === day);
  const out: CatchUpKind[] = [];
  if (input.foodUnknown && !input.beforeStart) out.push('food');
  if (input.on.sleep && !has(input.sleep.filter((r) => r.end !== undefined))) out.push('sleep');
  if (input.on.activity && !has(input.activities)) out.push('activity');
  if (input.on.water && !has(input.water)) out.push('water');
  return out.filter((k) => !input.skipped.has(k));
}

/** Epoch ms at `minutes` after midnight (local) on `day`. */
export function atDayMinute(day: string, minutes: number): number {
  const d = parseDay(day);
  d.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0);
  return d.getTime();
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** The night that ended on `day`, at the user's usual bed and wake times; undefined without nights logged. */
export function usualNight(records: SleepRecord[], day: string): { start: number; end: number } | undefined {
  const usual = usualTimes(records);
  if (!usual) return undefined;
  const end = atDayMinute(day, usual.wake);
  let start = atDayMinute(day, usual.bed);
  if (start >= end) start -= 24 * 60 * 60_000;
  return { start, end };
}

/** How far back the quick picks look. */
const RECENT_DAYS = 60;

export interface FrequentActivity {
  kind: ActivityRecord['kind'];
  name?: string;
  outside: boolean;
  intensity?: Intensity;
  sunSkin?: ActivityRecord['sunSkin'];
  /** Usual length and start (minutes after midnight): medians of the times it was logged. */
  minutes: number;
  startMinute: number;
  count: number;
}

/**
 * The activities logged most often in the last 60 days before `day`, as one-tap picks: the same kind,
 * name and inside/outside count as one, with their usual length and start time. Ties go to the most recent.
 */
export function frequentActivities(records: readonly ActivityRecord[], day: string, n = 4): FrequentActivity[] {
  const from = parseDay(day);
  from.setDate(from.getDate() - RECENT_DAYS);
  const groups = new Map<string, ActivityRecord[]>();
  for (const r of records) {
    if (r.day >= day || r.time < from.getTime()) continue;
    const key = `${r.kind}|${(r.name ?? '').trim().toLowerCase()}|${r.outside}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((rs) => {
      const latest = rs.reduce((a, b) => (b.time > a.time ? b : a));
      return {
        pick: {
          kind: latest.kind,
          name: latest.name,
          outside: latest.outside,
          intensity: latest.intensity,
          sunSkin: latest.sunSkin,
          minutes: median(rs.map((r) => r.minutes)),
          startMinute: median(rs.map((r) => minuteOfDay(r.time))),
          count: rs.length,
        },
        latest: latest.time,
      };
    })
    .sort((a, b) => b.pick.count - a.pick.count || b.latest - a.latest)
    .slice(0, n)
    .map((g) => g.pick);
}

/** Plain water on a usual day: the median daily total of the last 14 days with water before `day`. */
export function usualWater(records: readonly WaterRecord[], day: string): number | undefined {
  const byDay = new Map<string, number>();
  for (const r of records) if (r.day < day) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.ml);
  const recent = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([, ml]) => ml);
  return recent.length ? median(recent) : undefined;
}
