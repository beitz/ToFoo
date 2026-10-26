import { parseDay } from '../lib/dates';
import type { ActivityRecord, AskDays, Intensity, SleepRecord, WaterRecord } from '../storage/types';
import { activityKey } from './activity';
import { isoWeekday } from './habits';
import { minuteOfDay } from './nights';
import { usualTimes } from './sleep';

/**
 * "Yesterday is missing…" (owner's ask, 2026-10-23: he kept forgetting to log his commute): what a
 * past day lacks among the things the user tracks, and quick ways to fill it in. Pure: the caller
 * passes the records and which trackers are on.
 */

export const CATCH_UP_KINDS = ['food', 'sleep', 'activity', 'water', 'habits'] as const;
export type CatchUpKind = (typeof CATCH_UP_KINDS)[number];

/**
 * Whether `day` is one to ask about `kind` on (owner's ask, 2026-10-26: he sleeps every night but
 * doesn't do something every day). Unset = every day, an empty list = never.
 */
export function asksOn(askDays: AskDays | undefined, kind: CatchUpKind, day: string): boolean {
  const days = askDays?.[kind];
  return !days || days.includes(isoWeekday(day));
}

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
  /** Habits are on and some due that day are still open (see openHabitsOn in ./habits). */
  habitsOpen?: boolean;
  /** The weekdays to ask about each kind on (Settings → Reminders); unset = every day. */
  askDays?: AskDays;
}

/**
 * What `day` is missing, in a fixed order: every tracker that is on, even one never used yet (the
 * owner switched Activity on and expected the question). Days before a tracker's first entry are not
 * asked about, so an older day in the diary doesn't ask for what wasn't tracked then. A sleep counts
 * for the day it ended on. A day the user said not to ask about (`askDays`) lacks nothing of that kind.
 */
export function missingOn(input: CatchUpInput): CatchUpKind[] {
  const { day } = input;
  const lacks = (rs: readonly { day: string }[]) => (!rs.some((r) => r.day <= day) ? !rs.length : !rs.some((r) => r.day === day));
  const out: CatchUpKind[] = [];
  if (input.foodUnknown && !input.beforeStart) out.push('food');
  if (input.on.sleep && lacks(input.sleep.filter((r) => r.end !== undefined))) out.push('sleep');
  if (input.on.activity && lacks(input.activities)) out.push('activity');
  if (input.on.water && lacks(input.water)) out.push('water');
  if (input.habitsOpen) out.push('habits');
  return out.filter((k) => !input.skipped.has(k) && asksOn(input.askDays, k, day));
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
  compendium?: string;
  sunSkin?: ActivityRecord['sunSkin'];
  /** Usual length and start (minutes after midnight): medians of the times it was logged. */
  minutes: number;
  startMinute: number;
  count: number;
}

/**
 * The activities logged most often in the last 60 days (`days`) before `day`, as one-tap picks: the
 * same kind, name, Compendium row and inside/outside count as one (activityKey), with their usual
 * length and start time. Ties go to the most recent. `withDay` counts `day` itself too (the activity
 * sheet's Recent list, where today's walk already counts).
 */
export function frequentActivities(records: readonly ActivityRecord[], day: string, n = 4, { days = RECENT_DAYS, withDay = false } = {}): FrequentActivity[] {
  const from = parseDay(day);
  from.setDate(from.getDate() - days);
  const groups = new Map<string, ActivityRecord[]>();
  for (const r of records) {
    if ((withDay ? r.day > day : r.day >= day) || r.time < from.getTime()) continue;
    const key = activityKey(r);
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
          compendium: latest.compendium,
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
