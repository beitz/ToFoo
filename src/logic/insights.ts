/**
 * Insights (docs/SPEC.md, "Insights"): the numbers behind "Look for patterns". The assistant only
 * chooses what to compare; everything here computes it from the stored data, so every count and
 * average in an answer comes from the app. Pure: tested in insights.test.ts.
 */
import { normalize } from '../foods/search';
import { addDays, dayKey, dayRange, parseDay } from '../lib/dates';
import { NUTRIENTS } from '../model/nutrients';
import { groupMeals, type DailyTotals } from '../model/simulate';
import type { DayStatus, ModelEntry } from '../model/types';
import type { ActivityRecord, JournalEntry, SleepRecord, WaterRecord } from '../storage/types';
import { isNight, sleepBlocks } from './sleep';

export interface InsightInput {
  /** The model's days, aligned with `daily` (src/app/data.tsx). */
  days: readonly string[];
  daily: readonly DailyTotals[];
  dayStatus: Readonly<Record<string, DayStatus | 'pending'>>;
  entries: readonly ModelEntry[];
  journal: readonly JournalEntry[];
  sleep: readonly SleepRecord[];
  activities: readonly ActivityRecord[];
  water: readonly WaterRecord[];
  mealWindowMinutes: number;
  today: string;
}

export type MeasureGroup = 'food' | 'sleep' | 'activity' | 'water' | 'journal';

export interface MeasureDef {
  id: string;
  group: MeasureGroup;
  name: string;
  unit: string;
  decimals: number;
  /** What the value means, for the assistant. */
  about?: string;
}

const OWN_MEASURES: MeasureDef[] = [
  { id: 'alcohol', group: 'food', name: 'Alcohol', unit: 'g', decimals: 0, about: 'grams of alcohol in the logged foods and drinks (BLS)' },
  { id: 'meals', group: 'food', name: 'Meals', unit: '', decimals: 0, about: 'number of meals (entries close together are one meal; supplements not counted)' },
  { id: 'first_meal', group: 'food', name: 'First meal', unit: 'h', decimals: 1, about: 'clock time of the first meal in hours, 7.5 = 07:30' },
  { id: 'last_meal', group: 'food', name: 'Last meal', unit: 'h', decimals: 1, about: 'clock time of the last meal in hours, 21.25 = 21:15' },
  { id: 'sleep_hours', group: 'sleep', name: 'Sleep', unit: 'h', decimals: 1, about: 'hours asleep in the night that ended on this day (the night before it); sleeps less than 3 h apart are one night, their times added up' },
  { id: 'bedtime', group: 'sleep', name: 'Fell asleep', unit: 'h', decimals: 1, about: 'clock time of first falling asleep that night, counted from the evening before: 23.5 = 23:30, 24.5 = 00:30' },
  { id: 'wake_time', group: 'sleep', name: 'Woke up', unit: 'h', decimals: 1, about: 'clock time of last waking up from that night, 7.25 = 07:15' },
  { id: 'nap_minutes', group: 'sleep', name: 'Naps', unit: 'min', decimals: 0, about: 'minutes of sleeps that ended on this day and are not part of a night (less than 3 h of sleep in all)' },
  { id: 'activity_minutes', group: 'activity', name: 'Activity', unit: 'min', decimals: 0, about: 'minutes of all logged activities' },
  { id: 'hard_minutes', group: 'activity', name: 'Moderate or hard activity', unit: 'min', decimals: 0, about: 'minutes of activities marked moderate or hard' },
  { id: 'outside_minutes', group: 'activity', name: 'Activity outside', unit: 'min', decimals: 0 },
  { id: 'plain_water', group: 'water', name: 'Plain water', unit: 'ml', decimals: 0 },
  { id: 'total_water', group: 'water', name: 'Water from drinks and food', unit: 'ml', decimals: 0, about: 'plain water plus the water in logged foods and drinks' },
  { id: 'journal_entries', group: 'journal', name: 'Journal entries', unit: '', decimals: 0 },
];

/** Everything that has a number per day. Nutrients: amount eaten (after cooking and storage losses, not absorbed), in BLS units. */
export const MEASURES: readonly MeasureDef[] = [
  ...NUTRIENTS.map((n): MeasureDef => ({ id: n.id, group: 'food', name: n.name, unit: n.unit, decimals: n.decimals })),
  ...OWN_MEASURES,
];
export const MEASURE_BY_ID = new Map(MEASURES.map((m) => [m.id, m]));

export interface DayEntry {
  time: number;
  label: string;
  /** Grams of the foods in it; missing for manual entries and supplements. */
  grams?: number;
  supplement: boolean;
}

export interface DayFacts {
  day: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  status: DayStatus | 'pending';
  /**
   * The food log of this day is complete (logged or fasted, and over): its totals can be trusted and
   * a food not in it was not eaten. Otherwise food values are unknown, never zero.
   */
  foodComplete: boolean;
  entries: DayEntry[];
  /** `private`: the user keeps it from the AI; shareInsightData leaves it out unless they include private entries. */
  journal: Array<{ time: number; text: string; private?: boolean }>;
  night?: { start: number; end: number };
  activities: ActivityRecord[];
  /** Value per measure id; null = not known that day (not logged, not tracked yet). */
  values: Record<string, number | null>;
  /** Measures some item on this day had no data for: that day's value is a minimum. */
  missing: ReadonlySet<string>;
  /** Normalised food names of the day (entry labels and each food in English and German), for matching. */
  foodText: string;
  journalText: string;
}

export interface InsightData {
  days: ReadonlyMap<string, DayFacts>;
  /** First day with any data. */
  first: string;
  today: string;
}

const HOUR = 3_600_000;

/** Clock time in hours (7.5 = 07:30). */
function clockHours(t: number): number {
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60;
}

const earliest = (xs: readonly string[]) => xs.reduce<string | undefined>((min, x) => (min === undefined || x < min ? x : min), undefined);

/** Every day's facts, from the first day with any data to today. */
export function buildInsightData(input: InsightInput): InsightData {
  const index = new Map(input.days.map((d, i) => [d, i]));
  const byDay = <T extends { day: string }>(xs: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.day, [...(m.get(x.day) ?? []), x]);
    return m;
  };
  const entriesByDay = new Map<string, ModelEntry[]>();
  for (const e of input.entries) entriesByDay.set(e.dayKey, [...(entriesByDay.get(e.dayKey) ?? []), e]);
  const journal = byDay(input.journal);
  // A night with waking up in between is one night, on the day it ended; the parts of shorter blocks are naps.
  const blocksByDay = new Map<string, ReturnType<typeof sleepBlocks>>();
  for (const b of sleepBlocks(input.sleep)) {
    const k = dayKey(new Date(b.end));
    blocksByDay.set(k, [...(blocksByDay.get(k) ?? []), b]);
  }
  const activities = byDay(input.activities);
  const water = byDay(input.water);
  // A tracker counts as in use from its first record on: before that its days are unknown, after it an empty day is a real zero.
  const since = {
    journal: earliest(input.journal.map((x) => x.day)),
    sleep: earliest(input.sleep.filter((s) => s.end !== undefined).map((s) => s.day)),
    activity: earliest(input.activities.map((x) => x.day)),
    water: earliest(input.water.map((x) => x.day)),
  };
  const tracked = (k: keyof typeof since, day: string) => since[k] !== undefined && day >= since[k];
  const first = earliest([input.days[0] ?? input.today, ...Object.values(since).filter((x): x is string => !!x)]) ?? input.today;

  const days = new Map<string, DayFacts>();
  for (const day of dayRange(first <= input.today ? first : input.today, input.today)) {
    const i = index.get(day);
    const totals = i === undefined ? undefined : input.daily[i];
    const status = input.dayStatus[day] ?? (day === input.today ? 'pending' : 'unknown');
    const foodComplete = totals !== undefined && day !== input.today && (status === 'logged' || status === 'fasted');
    const dayEntries = [...(entriesByDay.get(day) ?? [])].sort((a, b) => a.time - b.time);
    const values: Record<string, number | null> = {};
    const missing = new Set<string>(totals?.missing ?? []);

    for (const n of NUTRIENTS) values[n.id] = foodComplete ? (totals!.intake[n.id] ?? 0) : null;
    let alcohol = 0;
    let foodWater = 0;
    for (const e of dayEntries) {
      for (const p of e.parts) {
        const a = p.per100.ALC;
        if (a === null || a === undefined) missing.add('alcohol');
        else if (a !== 't') alcohol += (p.grams * a) / 100;
        const w = p.per100.WATER;
        if (w === null || w === undefined) missing.add('total_water');
        else if (w !== 't') foodWater += (p.grams * w) / 100;
      }
      if (e.parts.length === 0 && !e.isSupplement) missing.add('total_water');
    }
    values.alcohol = foodComplete ? alcohol : null;
    const meals = groupMeals(dayEntries.filter((e) => !e.isSupplement), input.mealWindowMinutes);
    values.meals = foodComplete ? meals.length : null;
    values.first_meal = foodComplete && meals.length ? clockHours(meals[0]![0]!.time) : null;
    values.last_meal = foodComplete && meals.length ? clockHours(meals[meals.length - 1]![0]!.time) : null;

    const blocks = blocksByDay.get(day) ?? [];
    const night = blocks.filter(isNight).sort((a, b) => b.asleep - a.asleep)[0];
    values.sleep_hours = night ? night.asleep / HOUR : null;
    values.bedtime = night ? (clockHours(night.start) < 12 ? clockHours(night.start) + 24 : clockHours(night.start)) : null;
    values.wake_time = night ? clockHours(night.end) : null;
    values.nap_minutes = tracked('sleep', day) ? blocks.filter((b) => !isNight(b)).reduce((n, b) => n + b.asleep / 60_000, 0) : null;

    const acts = [...(activities.get(day) ?? [])].sort((a, b) => a.time - b.time);
    const actMinutes = (f: (a: ActivityRecord) => boolean) => (tracked('activity', day) ? acts.filter(f).reduce((n, a) => n + a.minutes, 0) : null);
    values.activity_minutes = actMinutes(() => true);
    values.hard_minutes = actMinutes((a) => a.intensity === 'moderate' || a.intensity === 'hard');
    values.outside_minutes = actMinutes((a) => a.outside);

    const plain = tracked('water', day) ? (water.get(day) ?? []).reduce((n, w) => n + w.ml, 0) : null;
    values.plain_water = plain;
    values.total_water = plain !== null && foodComplete ? plain + foodWater : null;

    const notes = [...(journal.get(day) ?? [])].sort((a, b) => a.time - b.time);
    values.journal_entries = tracked('journal', day) ? notes.length : null;

    const names = dayEntries.flatMap((e) => [e.label, ...e.parts.flatMap((p) => [p.label, p.nameEn ?? '', p.nameDe ?? ''])]);
    days.set(day, {
      day,
      weekday: parseDay(day).getDay(),
      status,
      foodComplete,
      entries: dayEntries.map((e) => ({
        time: e.time,
        label: e.label,
        ...(e.parts.length ? { grams: e.parts.reduce((n, p) => n + p.grams, 0) } : {}),
        supplement: e.isSupplement,
      })),
      journal: notes.map((n) => ({ time: n.time, text: n.text, ...(n.private ? { private: true } : {}) })),
      ...(night ? { night } : {}),
      activities: acts,
      values,
      missing,
      foodText: ` ${names.map(normalize).join(' | ')} `,
      journalText: ` ${notes.map((n) => normalize(n.text)).join(' | ')} `,
    });
  }
  return { days, first, today: input.today };
}

/**
 * Chance-check levels for reading results: under the first a possible pattern, under the second at
 * most a hint, above it no clear pattern. Conventional statistical levels, not physiological numbers.
 */
export const CHANCE_PATTERN = 0.05;
export const CHANCE_HINT = 0.2;

export const OPS = ['<', '<=', '>', '>='] as const;
export type Op = (typeof OPS)[number];
export const DAY_STATUSES = ['logged', 'partial', 'fasted', 'unknown', 'filled', 'excluded'] as const;

/** Furthest a condition may look away from the day it is checked for. */
export const MAX_OFFSET_DAYS = 28;
export const MAX_SPAN_DAYS = 28;

/**
 * One thing that holds or not on a day. `offset` moves it in time (-1: the day before, 1: the day
 * after), so delayed effects can be compared; `span` widens it to several days ending there (true
 * if it holds on any of them; for a measure, its average over them).
 */
export type Condition = (
  | { kind: 'journal'; words: string[] }
  | { kind: 'food'; words: string[] }
  | { kind: 'measure'; measure: string; op: Op; value: number }
  | { kind: 'weekday'; weekdays: number[] }
  | { kind: 'status'; statuses: Array<(typeof DAY_STATUSES)[number]> }
) & { offset?: number; span?: number; negate?: boolean };

/** Why a condition cannot be checked, or undefined if it is fine. */
export function conditionProblem(c: Condition): string | undefined {
  if ((c.kind === 'journal' || c.kind === 'food') && !c.words.some((w) => normalize(w))) return `A ${c.kind} condition needs at least one word.`;
  if (c.kind === 'measure' && !MEASURE_BY_ID.has(c.measure)) return `Unknown measure "${c.measure}".`;
  if (c.kind === 'measure' && !Number.isFinite(c.value)) return 'A measure condition needs a number to compare with.';
  if (c.kind === 'weekday' && !c.weekdays.length) return 'A weekday condition needs at least one weekday.';
  if (c.kind === 'status' && !c.statuses.length) return 'A status condition needs at least one status.';
  if (Math.abs(c.offset ?? 0) > MAX_OFFSET_DAYS) return `offset must be between -${MAX_OFFSET_DAYS} and ${MAX_OFFSET_DAYS}.`;
  if ((c.span ?? 1) < 1 || (c.span ?? 1) > MAX_SPAN_DAYS) return `span must be between 1 and ${MAX_SPAN_DAYS}.`;
  return undefined;
}

type Tri = boolean | null;

const hasWord = (text: string, words: readonly string[]) => words.some((w) => normalize(w) && text.includes(normalize(w)));

/** One condition on one day, before offset and span: true, false, or null when it cannot be told. */
function holdsOn(c: Condition, day: string, data: InsightData): Tri {
  if (c.kind === 'weekday') return c.weekdays.includes(parseDay(day).getDay());
  const f = data.days.get(day);
  if (!f) return null;
  switch (c.kind) {
    case 'status':
      return c.statuses.includes(f.status === 'pending' ? 'unknown' : f.status);
    case 'journal':
      if (hasWord(f.journalText, c.words)) return true;
      return f.values.journal_entries === null ? null : false;
    case 'food':
      if (hasWord(f.foodText, c.words)) return true;
      return f.foodComplete ? false : null;
    case 'measure': {
      const v = f.values[c.measure];
      return v === null || v === undefined ? null : compare(v, c.op, c.value);
    }
  }
}

function compare(v: number, op: Op, x: number): boolean {
  switch (op) {
    case '<':
      return v < x;
    case '<=':
      return v <= x;
    case '>':
      return v > x;
    case '>=':
      return v >= x;
  }
}

export function holds(c: Condition, day: string, data: InsightData): Tri {
  const offset = c.offset ?? 0;
  const span = Math.max(1, c.span ?? 1);
  const looked = Array.from({ length: span }, (_, k) => addDays(day, offset - k));
  let r: Tri;
  if (c.kind === 'measure') {
    const vals = looked.map((d) => data.days.get(d)?.values[c.measure]).filter((v): v is number => typeof v === 'number');
    r = vals.length ? compare(vals.reduce((a, b) => a + b, 0) / vals.length, c.op, c.value) : null;
  } else {
    const rs = looked.map((d) => holdsOn(c, d, data));
    r = rs.includes(true) ? true : rs.includes(null) ? null : false;
  }
  return r === null ? null : c.negate ? !r : r;
}

/** All conditions together: false if one is false, null if one cannot be told, true otherwise (also for none). */
export function holdsAll(cs: readonly Condition[], day: string, data: InsightData): Tri {
  let unknown = false;
  for (const c of cs) {
    const r = holds(c, day, data);
    if (r === false) return false;
    if (r === null) unknown = true;
  }
  return unknown ? null : true;
}

/** The days of a period that have data, clamped to the first data day and today. */
export function periodDays(data: InsightData, from: string, to: string): string[] {
  const f = from < data.first ? data.first : from;
  const t = to > data.today ? data.today : to;
  return f <= t ? dayRange(f, t) : [];
}

export interface CountResult {
  days: number;
  /** Days where the group conditions hold, and whether the outcome did (null: cannot be told). */
  groupDays: Array<{ day: string; outcome: Tri }>;
  group: { yes: number; known: number };
  others: { yes: number; known: number };
  /** Days where the group conditions could not be told (e.g. no sleep logged): left out. */
  unknownGroup: number;
  /** Two-sided Fisher exact test: how often a split at least this uneven turns up by chance alone (0–1). */
  chance?: number;
}

/** On how many group days, and on how many other days, does the outcome hold? */
export function countDays(data: InsightData, from: string, to: string, group: readonly Condition[], outcome: readonly Condition[]): CountResult {
  const r: CountResult = { days: 0, groupDays: [], group: { yes: 0, known: 0 }, others: { yes: 0, known: 0 }, unknownGroup: 0 };
  for (const day of periodDays(data, from, to)) {
    r.days++;
    const g = holdsAll(group, day, data);
    if (g === null) {
      r.unknownGroup++;
      continue;
    }
    const o = holdsAll(outcome, day, data);
    if (g) r.groupDays.push({ day, outcome: o });
    const side = g ? r.group : r.others;
    if (o !== null) {
      side.known++;
      if (o) side.yes++;
    }
  }
  if (r.group.known > 0 && r.others.known > 0) {
    r.chance = fisherExact(r.group.yes, r.group.known - r.group.yes, r.others.yes, r.others.known - r.others.yes);
  }
  return r;
}

export interface Stats {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** Days among these with an item lacking data for the measure: their values are minimums. */
  minimumDays: number;
}

export interface MeasureComparison {
  measure: string;
  group?: Stats;
  others?: Stats;
  /** Permutation test on the difference of the means: how often shuffled days differ as much (0–1). */
  chance?: number;
}

export interface CompareResult {
  days: number;
  /** Days where the group conditions hold; empty and unused without conditions. */
  groupDays: string[];
  unknownGroup: number;
  measures: MeasureComparison[];
}

function stats(days: readonly DayFacts[], measure: string): Stats | undefined {
  const known = days.filter((f) => typeof f.values[measure] === 'number');
  if (!known.length) return undefined;
  const xs = known.map((f) => f.values[measure]!).sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return {
    n: xs.length,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    median: xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2,
    min: xs[0]!,
    max: xs[xs.length - 1]!,
    minimumDays: known.filter((f) => f.missing.has(measure)).length,
  };
}

/**
 * Measures on the group days against the other days, or over all days of the period when there
 * are no conditions.
 */
export function compareMeasures(data: InsightData, from: string, to: string, group: readonly Condition[], measures: readonly string[]): CompareResult {
  const all = periodDays(data, from, to).map((d) => data.days.get(d)!);
  const r: CompareResult = { days: all.length, groupDays: [], unknownGroup: 0, measures: [] };
  if (!group.length) {
    r.measures = measures.map((m) => ({ measure: m, ...(stats(all, m) ? { group: stats(all, m) } : {}) }));
    return r;
  }
  const inGroup: DayFacts[] = [];
  const others: DayFacts[] = [];
  for (const f of all) {
    const g = holdsAll(group, f.day, data);
    if (g === null) r.unknownGroup++;
    else (g ? inGroup : others).push(f);
  }
  r.groupDays = inGroup.map((f) => f.day);
  r.measures = measures.map((m) => {
    const g = stats(inGroup, m);
    const o = stats(others, m);
    const val = (fs: DayFacts[]) => fs.map((f) => f.values[m]).filter((v): v is number => typeof v === 'number');
    return { measure: m, ...(g ? { group: g } : {}), ...(o ? { others: o } : {}), ...(g && o && g.n >= 2 && o.n >= 2 ? { chance: permutationChance(val(inGroup), val(others)) } : {}) };
  });
  return r;
}

export interface Overview {
  from: string;
  to: string;
  days: number;
  /** Days per food log status. */
  status: Record<(typeof DAY_STATUSES)[number], number>;
  foodComplete: number;
  journalEntries: number;
  journalDays: number;
  /** Of journalEntries, those marked private. */
  privateJournalEntries: number;
  nights: number;
  activityDays: number;
  waterDays: number;
}

/** What the user can choose to share in Insights, each a whole tracker (docs/SPEC.md, "Insights"). */
export const SHARE_KINDS = ['food', 'journal', 'sleep', 'activity', 'water'] as const satisfies readonly MeasureGroup[];
export type ShareKind = (typeof SHARE_KINDS)[number];

/**
 * Only what the user chose to send: the days from `from` to today, and the kinds ticked. The
 * assistant's tools read nothing else, so a day or tracker left out cannot reach Anthropic whatever
 * the model asks for. A kind left out reads as not tracked (unknown), never as zero. Private journal
 * entries stay out unless `privateJournal`: a day with only private ones reads as not mentioned.
 */
export function shareInsightData(data: InsightData, from: string, kinds: ReadonlySet<ShareKind>, { privateJournal = false }: { privateJournal?: boolean } = {}): InsightData {
  const first = from > data.first ? from : data.first;
  const hidden = new Set(MEASURES.filter((m) => !kinds.has(m.group)).map((m) => m.id));
  // Water from drinks and food needs the food log too.
  if (!kinds.has('food')) hidden.add('total_water');
  const food = kinds.has('food');
  const days = new Map<string, DayFacts>();
  for (const [day, f] of data.days) {
    if (day < first) continue;
    const { night, ...rest } = f;
    const notes = kinds.has('journal') ? f.journal.filter((n) => privateJournal || !n.private) : [];
    const values = Object.fromEntries(Object.entries(f.values).map(([id, v]) => [id, hidden.has(id) ? null : v]));
    if (values.journal_entries !== null && values.journal_entries !== undefined) values.journal_entries = notes.length;
    days.set(day, {
      ...rest,
      ...(kinds.has('sleep') && night ? { night } : {}),
      status: food ? f.status : 'unknown',
      foodComplete: food && f.foodComplete,
      entries: food ? f.entries : [],
      foodText: food ? f.foodText : ' ',
      journal: notes,
      journalText: notes.length === f.journal.length ? f.journalText : ` ${notes.map((n) => normalize(n.text)).join(' | ')} `,
      activities: kinds.has('activity') ? f.activities : [],
      values,
      missing: new Set([...f.missing].filter((id) => !hidden.has(id))),
    });
  }
  return { days, first, today: data.today };
}

/** What a period's data consists of: the user sees it before asking, the assistant gets it with the question. */
export function overview(data: InsightData, from: string, to: string): Overview {
  const days = periodDays(data, from, to).map((d) => data.days.get(d)!);
  const status = Object.fromEntries(DAY_STATUSES.map((s) => [s, 0])) as Overview['status'];
  for (const f of days) status[f.status === 'pending' ? 'unknown' : f.status]++;
  return {
    from: days[0]?.day ?? from,
    to: days[days.length - 1]?.day ?? to,
    days: days.length,
    status,
    foodComplete: days.filter((f) => f.foodComplete).length,
    journalEntries: days.reduce((n, f) => n + f.journal.length, 0),
    journalDays: days.filter((f) => f.journal.length > 0).length,
    privateJournalEntries: days.reduce((n, f) => n + f.journal.filter((j) => j.private).length, 0),
    nights: days.filter((f) => f.night).length,
    activityDays: days.filter((f) => f.activities.length > 0).length,
    waterDays: days.filter((f) => (f.values.plain_water ?? 0) > 0).length,
  };
}

/** Journal entries of a period, oldest first; with words, only those mentioning one of them. */
export function journalEntries(data: InsightData, from: string, to: string, words: readonly string[]): Array<{ day: string; time: number; text: string }> {
  return periodDays(data, from, to).flatMap((day) =>
    data.days
      .get(day)!
      .journal.filter((j) => !words.some((w) => normalize(w)) || hasWord(` ${normalize(j.text)} `, words))
      .map((j) => ({ day, ...j })),
  );
}

// Statistics: chance checks, so a pattern resting on a handful of days is not read as more than it is.

const logFactCache: number[] = [0];
function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1]! + Math.log(i);
  return logFactCache[n]!;
}

/** Two-sided Fisher exact test for the 2×2 table [[a, b], [c, d]]. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const logP = (x: number) => logFact(r1) - logFact(x) - logFact(r1 - x) + logFact(r2) - logFact(c1 - x) - logFact(r2 - c1 + x) - (logFact(n) - logFact(c1) - logFact(n - c1));
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = logP(x);
    // Tables as likely as the observed one count too (with a little room for rounding).
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** Shuffles per permutation test: enough for a stable percentage, cheap on a phone. */
const SHUFFLES = 2000;

/** Small seeded generator (mulberry32), so the same data always gives the same chance. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two-sided permutation test on the difference of the means of xs and ys. */
export function permutationChance(xs: readonly number[], ys: readonly number[], shuffles = SHUFFLES): number {
  const mean = (v: readonly number[], from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += v[i]!;
    return s / (to - from);
  };
  const pool = [...xs, ...ys];
  const observed = Math.abs(mean(pool, 0, xs.length) - mean(pool, xs.length, pool.length));
  const rnd = random(1);
  let hits = 0;
  for (let k = 0; k < shuffles; k++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    if (Math.abs(mean(pool, 0, xs.length) - mean(pool, xs.length, pool.length)) >= observed - 1e-9) hits++;
  }
  return (hits + 1) / (shuffles + 1);
}
