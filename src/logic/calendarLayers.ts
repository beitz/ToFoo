import type { DayStatus } from '../model/types';
import type { ActivityRecord, Habit, JournalEntry, SleepRecord, WaterRecord } from '../storage/types';
import type { CatchUpKind } from './catchUp';
import { habitsDaySummary, type HabitData, type HabitsDaySummary } from './habits';

/**
 * What the calendar shows per day for each thing the user tracks (owner's ask, 2026-10-23: meals were
 * logged but activities forgotten, and the calendar could not show which days). Pure.
 */

export const LAYERS = ['meals', 'sleep', 'activity', 'water', 'journal', 'habits'] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * logged: something is there; missing: nothing, and the day is one that should have it (over, in use);
 * skipped: the user answered "Skip" on the fill-in page; none: nothing to say (before first use, today
 * not over yet, journal days without an entry).
 */
export type Mark = 'logged' | 'missing' | 'skipped' | 'none';

export interface DayLayers {
  marks: Record<Layer, Mark>;
  /** Hours asleep (nights ending that day), minutes active, plain water in ml, journal entries. */
  sleepMinutes: number;
  activityMinutes: number;
  waterMl: number;
  journal: number;
  /** Habits kept, missed and (daily ones) still open that day. */
  habits: HabitsDaySummary;
}

export interface LayersInput {
  days: readonly string[];
  today: string;
  /** The model's day status (meals); days before the model starts are absent. */
  dayStatus: Readonly<Record<string, DayStatus | 'pending'>>;
  sleep: readonly Pick<SleepRecord, 'day' | 'start' | 'end'>[];
  activities: readonly Pick<ActivityRecord, 'day' | 'minutes'>[];
  water: readonly Pick<WaterRecord, 'day' | 'ml'>[];
  journal: readonly Pick<JournalEntry, 'day'>[];
  /** Kinds skipped on the fill-in page, by day. */
  skipped: Readonly<Record<string, readonly CatchUpKind[]>>;
  /** The habits and what they need, when habits are on. */
  habits?: { list: readonly Habit[]; data: HabitData };
}

function firstDay(rs: readonly { day: string }[]): string | undefined {
  let first: string | undefined;
  for (const r of rs) if (!first || r.day < first) first = r.day;
  return first;
}

/** Per day: a mark for each layer and the amounts the single-layer views show. */
export function dayLayers(input: LayersInput): Map<string, DayLayers> {
  const finished = input.sleep.filter((r): r is typeof r & { end: number } => r.end !== undefined);
  // A tracker counts as in use from the first day anything was logged with it; before that, nothing is missing.
  const since = { sleep: firstDay(finished), activity: firstDay(input.activities), water: firstDay(input.water) };
  const sum = <T extends { day: string }>(rs: readonly T[], day: string, f: (r: T) => number) => rs.reduce((a, r) => (r.day === day ? a + f(r) : a), 0);
  const out = new Map<string, DayLayers>();
  for (const day of input.days) {
    const over = day < input.today;
    const skipped = new Set(input.skipped[day] ?? []);
    const sleepMinutes = Math.round(sum(finished, day, (r) => (r.end - r.start) / 60_000));
    const has = { sleep: finished.some((r) => r.day === day), activity: input.activities.some((r) => r.day === day), water: input.water.some((r) => r.day === day) };
    const tracker = (layer: 'sleep' | 'activity' | 'water'): Mark => {
      if (has[layer]) return 'logged';
      if (skipped.has(layer)) return 'skipped';
      const from = since[layer];
      return over && from !== undefined && day >= from ? 'missing' : 'none';
    };
    const st = input.dayStatus[day];
    const meals: Mark = st === undefined || st === 'pending' ? 'none' : st === 'unknown' ? (skipped.has('food') ? 'skipped' : 'missing') : 'logged';
    const journal = input.journal.filter((r) => r.day === day).length;
    const habits = input.habits ? habitsDaySummary(input.habits.list, day, input.habits.data) : { kept: 0, missed: 0, open: 0 };
    // A day with any habit answered counts as logged; one with only open daily habits is missing them, once over.
    const habitMark: Mark = habits.kept + habits.missed > 0 ? 'logged' : skipped.has('habits') ? 'skipped' : over && habits.open > 0 ? 'missing' : 'none';
    out.set(day, {
      marks: { meals, sleep: tracker('sleep'), activity: tracker('activity'), water: tracker('water'), journal: journal ? 'logged' : 'none', habits: habitMark },
      sleepMinutes,
      activityMinutes: sum(input.activities, day, (r) => r.minutes),
      waterMl: sum(input.water, day, (r) => r.ml),
      journal,
      habits,
    });
  }
  return out;
}

/** How many of the days have the layer logged, and how many are missing it. */
export function layerCounts(layers: Map<string, DayLayers>, layer: Layer): { logged: number; missing: number } {
  let logged = 0;
  let missing = 0;
  for (const l of layers.values()) {
    if (l.marks[layer] === 'logged') logged++;
    else if (l.marks[layer] === 'missing') missing++;
  }
  return { logged, missing };
}
