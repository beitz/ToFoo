import { addDays, dayKey, parseDay } from '../lib/dates';
import { weekStart } from '../lib/periods';
import type { ActivityRecord, Habit, HabitDay, HabitGoal, HabitQuickLog } from '../storage/types';
import type { SkinExposure } from '../model/sun';

/**
 * Habits (docs/SPEC.md, "Habits", owner's ask 2026-10-26): what each day means for a habit, how a
 * week went, how often it was kept and how long the run is. Pure: the caller passes the answers, the
 * activities and today. A day nobody answered is open, never "not done" (missing is not zero).
 */

/** kept: done, or none of what is avoided, or the minutes reached; missed: the other answer; open: not answered yet; off: not due and not answered. */
export type HabitMark = 'kept' | 'missed' | 'open' | 'off';

export type HabitActivityLike = Pick<ActivityRecord, 'day' | 'kind' | 'name' | 'minutes'>;

export interface HabitData {
  today: string;
  /** Habit id → day → did (done, or had some). */
  answers: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  activities: readonly HabitActivityLike[];
  /** Days answered "No activity" on the catch-up page: a minutes habit with nothing logged is missed then, not open. */
  noActivity: ReadonlySet<string>;
}

export function answersByHabit(days: readonly Pick<HabitDay, 'habitId' | 'day' | 'did'>[]): Map<string, Map<string, boolean>> {
  const out = new Map<string, Map<string, boolean>>();
  for (const d of days) {
    let m = out.get(d.habitId);
    if (!m) out.set(d.habitId, (m = new Map()));
    m.set(d.day, d.did);
  }
  return out;
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  return ((parseDay(day).getDay() + 6) % 7) + 1;
}

/** Whether the habit asks for an answer on `day` (a weekly goal may be met on any day). */
export function isDue(goal: HabitGoal, day: string): boolean {
  return goal.type !== 'weekdays' || goal.days.includes(isoWeekday(day));
}

/** The first day the habit counts: the day it was made, or an earlier day answered for it. */
export function habitStart(h: Pick<Habit, 'id' | 'createdAt'>, data: Pick<HabitData, 'answers'>): string {
  let start = dayKey(new Date(h.createdAt));
  for (const day of data.answers.get(h.id)?.keys() ?? []) if (day < start) start = day;
  return start;
}

/** Whether an activity counts toward a minutes habit (no picks: any activity). */
export function activityCounts(h: Pick<Habit, 'activities'>, a: Pick<ActivityRecord, 'kind' | 'name'>): boolean {
  const picks = h.activities ?? [];
  if (!picks.length) return true;
  const name = a.name?.trim().toLowerCase();
  return picks.some((p) => p.kind === a.kind && (!p.name || p.name.trim().toLowerCase() === name));
}

/**
 * The activity one tap on a "One tap logs it" card logs: the preset, ending at the tap (the user taps
 * when the walk is over), on the day it started.
 */
export function quickActivity(q: HabitQuickLog, now: number, skin: SkinExposure): Omit<ActivityRecord, 'id' | 'schemaVersion'> {
  const time = now - q.minutes * 60_000;
  const name = q.name?.trim();
  return {
    kind: q.kind,
    ...(name ? { name } : {}),
    time,
    day: dayKey(new Date(time)),
    minutes: Math.round(q.minutes),
    intensity: q.intensity,
    outside: q.outside,
    ...(q.outside && q.sun ? { sunSkin: skin } : {}),
  };
}

/** Minutes of matching activity on a day, all sessions together (owner's pick: the day's total). */
export function habitMinutes(h: Pick<Habit, 'activities'>, activities: readonly HabitActivityLike[], day: string): number {
  return activities.reduce((sum, a) => (a.day === day && activityCounts(h, a) ? sum + a.minutes : sum), 0);
}

export interface HabitDayState {
  mark: HabitMark;
  /** Do and avoid habits: the answer, when there is one. */
  did?: boolean;
  /** Minutes habits: matching minutes that day. */
  minutes?: number;
}

/** What `day` is for the habit. Days before it started are off. */
export function habitDay(h: Habit, day: string, data: HabitData, start = habitStart(h, data)): HabitDayState {
  if (day < start || day > data.today) return { mark: 'off' };
  if (h.kind === 'minutes') {
    const minutes = habitMinutes(h, data.activities, day);
    if (minutes >= (h.minutes ?? 0)) return { mark: 'kept', minutes };
    if (!isDue(h.goal, day)) return { mark: 'off', minutes };
    // Another activity that day, or "No activity", answers it; nothing at all leaves it open.
    const answered = minutes > 0 || data.noActivity.has(day) || data.activities.some((a) => a.day === day);
    return { mark: answered ? 'missed' : 'open', minutes };
  }
  const did = data.answers.get(h.id)?.get(day);
  if (did !== undefined) return { mark: did === (h.kind === 'do') ? 'kept' : 'missed', did };
  return { mark: isDue(h.goal, day) ? 'open' : 'off' };
}

export type WeekOutcome = 'reached' | 'notReached' | 'open' | 'running';

export interface HabitWeek {
  monday: string;
  /** Days kept (do, minutes) or days had (avoid), so far. */
  count: number;
  /** The number it is held against: times a week (at least / at most), or the days due so far. */
  of: number;
  open: number;
  outcome: WeekOutcome;
}

/**
 * How a week went. Weekly goals: reached once kept on n days (an avoid habit: had on at most n), not
 * reached once that can't happen any more, open when unanswered days could still change it, running
 * for the current week. Daily goals: reached when every due day so far was kept.
 */
export function habitWeek(h: Habit, monday: string, data: HabitData, start = habitStart(h, data)): HabitWeek {
  const days = [...Array(7)].map((_, i) => addDays(monday, i)).filter((d) => d >= start && d <= data.today);
  const current = addDays(monday, 6) >= data.today;
  const marks = days.map((d) => habitDay(h, d, data, start).mark);
  const n = (m: HabitMark) => marks.filter((x) => x === m).length;
  const open = n('open');
  if (h.goal.type === 'perWeek') {
    const times = h.goal.times;
    if (h.kind === 'avoid') {
      const had = n('missed');
      const outcome: WeekOutcome = had > times ? 'notReached' : current ? 'running' : had + open > times ? 'open' : 'reached';
      return { monday, count: had, of: times, open, outcome };
    }
    const kept = n('kept');
    // A week the habit started in the middle of can't be held against the full number.
    const partial = days.length < 7 && !current;
    const outcome: WeekOutcome = kept >= times ? 'reached' : current ? 'running' : partial || kept + open >= times ? 'open' : 'notReached';
    return { monday, count: kept, of: times, open, outcome };
  }
  const kept = n('kept');
  const due = kept + n('missed') + open;
  const outcome: WeekOutcome = n('missed') > 0 ? 'notReached' : open > 0 ? (current ? 'running' : 'open') : current ? 'running' : 'reached';
  return { monday, count: kept, of: due, open, outcome };
}

/** Today, while it can still change: open, or a minutes habit not reached yet. */
function unsettled(h: Pick<Habit, 'kind'>, day: string, mark: HabitMark, today: string): boolean {
  return day === today && (mark === 'open' || (mark === 'missed' && h.kind === 'minutes'));
}

/** One step of a run: a due day for a daily goal, a week for a weekly goal. */
type Step = 'kept' | 'notKept' | 'pending';

/** Days or weeks in a row, and the longest such run. */
export interface HabitRun {
  unit: 'days' | 'weeks';
  current: number;
  longest: number;
}

/** Forgiven: one step that isn't kept in any 7 (as for the logging streak), so one forgotten day doesn't reset it. */
export const RUN_FORGIVE_EVERY = 7;

/**
 * The run of a habit: kept days in a row (only the days it is due), or reached weeks in a row for a
 * weekly goal. One missed or open step per 7 is forgiven; today and yesterday, or the current week,
 * don't break it while still open (yesterday can be filled in). Answering a past day later repairs it.
 */
export function habitRun(h: Habit, data: HabitData): HabitRun {
  const start = habitStart(h, data);
  const steps: Step[] = [];
  if (h.goal.type === 'perWeek') {
    for (let monday = weekStart(start); monday <= data.today; monday = addDays(monday, 7)) {
      const w = habitWeek(h, monday, data, start);
      steps.push(w.outcome === 'reached' ? 'kept' : w.outcome === 'running' ? 'pending' : 'notKept');
    }
  } else {
    const yesterday = addDays(data.today, -1);
    for (let day = start; day <= data.today; day = addDays(day, 1)) {
      const { mark } = habitDay(h, day, data, start);
      if (mark === 'off') continue;
      steps.push(mark === 'kept' ? 'kept' : unsettled(h, day, mark, data.today) || (mark === 'open' && day === yesterday) ? 'pending' : 'notKept');
    }
  }
  let current = 0;
  let longest = 0;
  let forgivenAt = -Infinity;
  steps.forEach((s, i) => {
    if (s === 'kept') current++;
    else if (s === 'notKept') {
      if (current > 0 && i - forgivenAt >= RUN_FORGIVE_EVERY) forgivenAt = i;
      else current = 0;
    }
    longest = Math.max(longest, current);
  });
  return { unit: h.goal.type === 'perWeek' ? 'weeks' : 'days', current, longest };
}

/** How often it was kept: days this month for a daily goal, weeks of the last 8 for a weekly one. */
export interface HabitTally {
  unit: 'days' | 'weeks';
  kept: number;
  of: number;
  open: number;
}

export const TALLY_WEEKS = 8;

export function habitTally(h: Habit, data: HabitData): HabitTally {
  const start = habitStart(h, data);
  if (h.goal.type === 'perWeek') {
    let kept = 0;
    let of = 0;
    let open = 0;
    const thisWeek = weekStart(data.today);
    for (let i = TALLY_WEEKS - 1; i >= 0; i--) {
      const monday = addDays(thisWeek, -7 * i);
      if (addDays(monday, 6) < start) continue;
      const w = habitWeek(h, monday, data, start);
      // The current week counts once it is reached; until then it is still going.
      if (w.outcome === 'running') continue;
      of++;
      if (w.outcome === 'reached') kept++;
      else if (w.outcome === 'open') open++;
    }
    return { unit: 'weeks', kept, of, open };
  }
  let kept = 0;
  let of = 0;
  let open = 0;
  const first = data.today.slice(0, 8) + '01';
  for (let day = first > start ? first : start; day <= data.today; day = addDays(day, 1)) {
    const { mark } = habitDay(h, day, data, start);
    if (mark === 'off' || unsettled(h, day, mark, data.today)) continue;
    of++;
    if (mark === 'kept') kept++;
    else if (mark === 'open') open++;
  }
  return { unit: 'days', kept, of, open };
}

/**
 * Habits to ask about on the fill-in page for a past day: do and avoid habits that are due and still
 * open. A weekly "do" goal isn't asked about day by day (only the days done matter), a weekly maximum is.
 */
export function openHabitsOn(habits: readonly Habit[], day: string, data: HabitData): Habit[] {
  return habits.filter((h) => !h.archived && h.kind !== 'minutes' && !(h.kind === 'do' && h.goal.type === 'perWeek') && habitDay(h, day, data).mark === 'open');
}

/** All habits on one day, for the calendar: kept and missed answers, and daily habits still open. */
export interface HabitsDaySummary {
  kept: number;
  missed: number;
  /** Habits with a daily or weekday goal that are due and unanswered. */
  open: number;
}

export function habitsDaySummary(habits: readonly Habit[], day: string, data: HabitData): HabitsDaySummary {
  const out: HabitsDaySummary = { kept: 0, missed: 0, open: 0 };
  for (const h of habits) {
    if (h.archived) continue;
    const { mark } = habitDay(h, day, data);
    if (mark === 'kept') out.kept++;
    else if (mark === 'missed') out.missed++;
    else if (mark === 'open' && h.goal.type !== 'perWeek') out.open++;
  }
  return out;
}
