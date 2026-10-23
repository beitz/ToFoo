import { describe, expect, it } from 'vitest';
import { dayRange } from '../lib/dates';
import type { DailyTotals } from '../model/simulate';
import type { DayStatus, FoodPart, ModelEntry } from '../model/types';
import type { JournalEntry, SleepRecord } from '../storage/types';
import { buildInsightData, compareMeasures, conditionProblem, countDays, fisherExact, holds, journalEntries, overview, permutationChance, shareInsightData, type InsightInput } from './insights';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const key = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const days = dayRange('2026-10-01', '2026-10-10');

const part = (o: Partial<FoodPart>): FoodPart => ({ label: 'f', grams: 100, per100: { ALC: 0, WATER: 50 }, preparation: 'asListed', storage: 'fresh', ...o });
const entry = (day: number, h: number, parts: FoodPart[], o: Partial<ModelEntry> = {}): ModelEntry => ({ id: `e${day}${h}`, label: parts[0]?.label ?? 'x', time: at(day, h), dayKey: key(day), confidence: 'B', isSupplement: false, parts, ...o });
const coffee = (day: number) => entry(day, 8, [part({ label: 'Coffee (beverage)', nameEn: 'Coffee (beverage)', nameDe: 'Kaffee (Getränk)', grams: 200, per100: { ALC: 0, WATER: 99 } })]);
const bread = (day: number, h = 12) => entry(day, h, [part({ label: 'Rye bread', nameEn: 'Rye bread', nameDe: 'Roggenbrot', grams: 100 })]);
const beer = (day: number) => entry(day, 20, [part({ label: 'Beer', nameEn: 'Beer', nameDe: 'Bier', grams: 500, per100: { ALC: 3.8, WATER: 92 } })]);

// Short nights (5 h) ended on the 3rd, 5th and 7th; headaches on the 3rd, 5th and 8th.
const short = new Set([3, 5, 7]);
const sleep: SleepRecord[] = days.slice(0, 9).map((_, i) => {
  const d = i + 1;
  return { id: `s${d}`, schemaVersion: 1, day: key(d), start: short.has(d) ? at(d, 2) : at(d - 1, 23), end: at(d, 7) };
});
sleep.push({ id: 'nap', schemaVersion: 1, day: key(4), start: at(4, 14), end: at(4, 14, 40) });
const journal: JournalEntry[] = [
  { id: 'j1', schemaVersion: 1, day: key(1), time: at(1, 9), text: 'Feeling fine' },
  ...[3, 5, 8].map((d) => ({ id: `j${d}`, schemaVersion: 1, day: key(d), time: at(d, 13), text: 'Kopfschmerzen seit Mittag' })),
];
const entries = [coffee(2), coffee(4), beer(7), ...[1, 2, 3, 4, 5, 7, 8, 9].map((d) => bread(d)), bread(9, 21)];
const dayStatus: Record<string, DayStatus | 'pending'> = Object.fromEntries(days.map((d) => [d, 'logged' as DayStatus | 'pending']));
dayStatus[key(6)] = 'unknown';
dayStatus[key(10)] = 'pending';
const daily: DailyTotals[] = days.map((_, i) => ({
  absorbed: { low: {}, central: {}, high: {} },
  intake: { ENERCC: 2000 + i * 100 },
  supplementIntake: {},
  missing: new Set(i === 1 ? ['VITD'] : []),
}));

const input: InsightInput = { days, daily, dayStatus, entries, journal, sleep, activities: [], water: [], mealWindowMinutes: 60, today: key(10) };
const data = buildInsightData(input);
const headache = { kind: 'journal' as const, words: ['kopfschmerz', 'headache'] };

describe('insight day facts', () => {
  it('counts a night with waking up in between as one night, its parts added up', () => {
    const split: SleepRecord[] = [
      { id: 'a', schemaVersion: 1, day: key(2), start: at(1, 23), end: at(2, 1, 30) },
      { id: 'b', schemaVersion: 1, day: key(2), start: at(2, 2, 30), end: at(2, 7) },
    ];
    const v = buildInsightData({ ...input, sleep: split }).days.get(key(2))!.values;
    expect(v).toMatchObject({ sleep_hours: 7, bedtime: 23, wake_time: 7, nap_minutes: 0 });
  });

  it('derives sleep, meals, alcohol and nutrients per day, and leaves unknown days unknown', () => {
    const d3 = data.days.get(key(3))!;
    expect(d3.values.sleep_hours).toBe(5);
    expect(d3.values.bedtime).toBe(26); // 02:00, counted from the evening before
    expect(data.days.get(key(2))!.values.bedtime).toBe(23);
    expect(data.days.get(key(4))!.values.nap_minutes).toBe(40);
    expect(data.days.get(key(7))!.values.alcohol).toBeCloseTo(19);
    expect(data.days.get(key(9))!.values).toMatchObject({ meals: 2, first_meal: 12, last_meal: 21, ENERCC: 2800 });
    expect(data.days.get(key(6))!.values.ENERCC).toBeNull();
    expect(data.days.get(key(10))!.foodComplete).toBe(false);
    // Trackers never used are unknown, not zero.
    expect(data.days.get(key(3))!.values.activity_minutes).toBeNull();
    expect(data.days.get(key(3))!.values.journal_entries).toBe(1);
  });

  it('counts the outcome on group days against the other days, with a chance check', () => {
    const r = countDays(data, key(1), key(9), [{ kind: 'measure', measure: 'sleep_hours', op: '<', value: 6 }], [headache]);
    expect(r.group).toEqual({ yes: 2, known: 3 });
    expect(r.others).toEqual({ yes: 1, known: 6 });
    expect(r.groupDays).toEqual([
      { day: key(3), outcome: true },
      { day: key(5), outcome: true },
      { day: key(7), outcome: false },
    ]);
    expect(r.chance).toBeCloseTo(fisherExact(2, 1, 1, 5));
  });

  it('looks at the day before, in either language, and leaves out days it cannot tell', () => {
    const r = countDays(data, key(1), key(9), [{ kind: 'food', words: ['Kaffee'], offset: -1 }], [headache]);
    // After coffee on the 2nd and 4th: headaches on the 3rd and 5th. The 7th follows an unlogged day, the 1st has no day before.
    expect(r.group).toEqual({ yes: 2, known: 2 });
    expect(r.unknownGroup).toBe(2);
    expect(r.others).toEqual({ yes: 1, known: 5 });
  });

  it('negates and widens conditions', () => {
    const noBeerLately = { kind: 'food' as const, words: ['beer'], span: 2, negate: true };
    expect(holds(noBeerLately, key(8), data)).toBe(false); // beer the day before
    expect(holds(noBeerLately, key(9), data)).toBe(true);
    expect(holds(noBeerLately, key(10), data)).toBeNull(); // today's food is not complete yet
    expect(holds({ kind: 'measure', measure: 'sleep_hours', op: '<', value: 7, span: 2 }, key(4), data)).toBe(true); // (5 + 8) / 2
    expect(holds({ kind: 'weekday', weekdays: [6] }, key(3), data)).toBe(true); // 3 Oct 2026 is a Saturday
  });

  it('compares measures between groups, and describes a period without conditions', () => {
    const r = compareMeasures(data, key(1), key(9), [headache], ['ENERCC', 'sleep_hours']);
    expect(r.groupDays).toEqual([key(3), key(5), key(8)]);
    expect(r.measures[0]).toMatchObject({ measure: 'ENERCC', group: { n: 3, median: 2400, min: 2200, max: 2700 }, others: { n: 5, mean: 2360 } });
    expect(r.measures[1]!.group!.mean).toBe(6);
    expect(r.measures[1]!.chance).toBeGreaterThan(0);
    const all = compareMeasures(data, key(1), key(9), [], ['VITD']);
    expect(all.measures[0]!.group).toMatchObject({ n: 8, minimumDays: 1 });
  });

  it('summarises a period and finds journal entries by word', () => {
    expect(overview(data, '2026-09-01', key(10))).toMatchObject({ from: key(1), to: key(10), days: 10, foodComplete: 8, journalEntries: 4, journalDays: 4, nights: 9 });
    expect(journalEntries(data, key(1), key(10), ['KOPF']).map((j) => j.day)).toEqual([key(3), key(5), key(8)]);
    expect(journalEntries(data, key(1), key(2), [])).toHaveLength(1);
  });

  it('shares only the chosen period and kinds, and leaves the rest unknown', () => {
    const shared = shareInsightData(data, key(4), new Set(['journal', 'water']));
    expect(shared.first).toBe(key(4));
    expect([...shared.days.keys()]).toEqual(dayRange(key(4), key(10)));
    // Nothing from before the period, even when a tool asks for it.
    expect(journalEntries(shared, key(1), key(10), [])).toHaveLength(2);
    expect(holds(headache, key(4), shared)).toBe(false);
    expect(holds({ ...headache, offset: -1 }, key(4), shared)).toBeNull();
    const d7 = shared.days.get(key(7))!;
    expect(d7).toMatchObject({ status: 'unknown', foodComplete: false, entries: [], activities: [] });
    expect(d7.night).toBeUndefined();
    expect(d7.values).toMatchObject({ ENERCC: null, alcohol: null, sleep_hours: null, total_water: null, journal_entries: 0 });
    expect(holds({ kind: 'food', words: ['bier'] }, key(7), shared)).toBeNull();
    expect(overview(shared, key(1), key(10))).toMatchObject({ from: key(4), days: 7, foodComplete: 0, journalEntries: 2, nights: 0 });
    // All kinds: the same days as before, unchanged.
    const all = shareInsightData(data, '2026-01-01', new Set(['food', 'journal', 'sleep', 'activity', 'water']));
    expect(all.days.get(key(7))).toEqual(data.days.get(key(7)));
  });

  it('rejects conditions it cannot check', () => {
    expect(conditionProblem({ kind: 'measure', measure: 'mood', op: '<', value: 3 })).toMatch(/Unknown measure/);
    expect(conditionProblem({ kind: 'journal', words: [' '] })).toMatch(/word/);
    expect(conditionProblem({ ...headache, offset: -40 })).toMatch(/offset/);
    expect(conditionProblem(headache)).toBeUndefined();
  });
});

describe('chance checks', () => {
  it('matches the classic Fisher exact test', () => {
    expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.4857, 4);
    expect(fisherExact(5, 0, 0, 5)).toBeCloseTo(0.0079, 4);
  });

  it('gives a stable permutation result: small for a clear difference, large for none', () => {
    expect(permutationChance([10, 11, 12, 10, 11], [1, 2, 1, 2, 1])).toBeLessThan(0.02);
    expect(permutationChance([1, 2, 3], [1, 2, 3])).toBeGreaterThan(0.9);
    expect(permutationChance([1, 5, 2], [4, 3, 6])).toBe(permutationChance([1, 5, 2], [4, 3, 6]));
  });
});
