import { describe, expect, it } from 'vitest';
import { dayRange } from '../lib/dates';
import { weekStart } from '../lib/periods';
import { resolveRequirements } from '../model/requirements';
import { simulate } from '../model/simulate';
import { DEFAULT_MODEL_SETTINGS, type ModelEntry } from '../model/types';
import type { InsightData } from './insights';
import { defaultWeek, isoWeek, nutrientWeeks, suggestBatch, trackerWeek, trackerWeeks, weekMoves, weekPeriods, weekRecap, weeksEndingAt, weekWatch, type NutrientWeeks } from './weekly';

const req = resolveRequirements({ sex: 'male', birthYear: 1996, weightKg: 80, activity: 'medium' }, 2026);
// Mon 28 Sep to Sun 18 Oct 2026, with today on Wednesday 14 Oct.
const today = '2026-10-14';
const DAYS = dayRange('2026-09-28', today);

const vitC = (day: string, mg: number): ModelEntry => ({ id: `c${day}`, label: 'C', time: Date.parse(`${day}T12:00:00Z`), dayKey: day, confidence: 'A', isSupplement: true, parts: [], direct: { VITC: mg } });

describe('weeks', () => {
  it('starts weeks on Monday and never reaches past today', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weeksEndingAt('2026-10-12', 3, today)).toEqual([
      { from: '2026-09-28', to: '2026-10-04' },
      { from: '2026-10-05', to: '2026-10-11' },
      { from: '2026-10-12', to: '2026-10-13' },
    ]);
    expect(defaultWeek(today)).toBe('2026-10-12');
    expect(defaultWeek('2026-10-12')).toBe('2026-10-05');
  });

  // Week 1: 200 mg vitamin C a day. Week 2: none (nothing logged counts as nothing eaten). Week 3 so far: 200 mg a day.
  const entries = DAYS.filter((d) => d < '2026-10-05' || d >= '2026-10-12').filter((d) => d !== today).map((d) => vitC(d, 200));
  const sim = simulate({ days: DAYS, dayStatus: {}, entries, requirements: req, settings: DEFAULT_MODEL_SETTINGS, startingLevel: 'average', weightKg: 80, sex: 'male' });
  const weeks = weeksEndingAt('2026-10-12', 3, today);
  const periods = weekPeriods({ days: DAYS, sim, requirements: req, imputeUnlogged: false }, weeks);
  const rows = nutrientWeeks(periods);

  it('gives each nutrient a value per week and the week before, as the Review screen does', () => {
    const c = rows.get('VITC')!;
    expect(c.series).toHaveLength(3);
    expect(c.series[0]).toBeGreaterThan(1);
    expect(c.prev).toBe(0);
    expect(c.prevStatus).toBe('low');
    expect(c.value).toBeCloseTo(periods[2]!.nutrients.get('VITC')!.value.central);
    // The week in progress counts only its finished days (Monday and Tuesday), not today.
    expect(periods[2]!.countedDays).toBe(2);
    expect(periods[2]!.statusCounts.pending).toBe(0);
    expect(c.status).toBe('fine');
  });

  it('recaps closed gaps and the biggest rise', () => {
    const recap = weekRecap(rows);
    expect(recap.closed).toContain('VITC');
    expect(recap.opened).not.toContain('VITC');
    expect(recap.improved?.id).toBeDefined();
    expect(weekRecap(rows, new Set(['VITC'])).closed).not.toContain('VITC');
  });

  it('has no value for a week before the first log, rather than zero', () => {
    const early = weekPeriods({ days: DAYS, sim, requirements: req, imputeUnlogged: false }, weeksEndingAt('2026-09-28', 2, today));
    expect(nutrientWeeks(early).get('VITC')!.series[0]).toBeNull();
    expect(nutrientWeeks(early).get('VITC')!.prev).toBeNull();
  });
});

describe('weekRecap', () => {
  const row = (id: string, o: Partial<NutrientWeeks>): [string, NutrientWeeks] => [id, { id, kind: 'rolling', status: 'fine', value: 1, prev: 1, prevStatus: 'fine', series: [], ...o }];
  it('names new gaps, limits over the top and the biggest fall, and ignores small moves', () => {
    const rows = new Map([
      row('FE', { status: 'low', value: 0.4, prev: 0.9, prevStatus: 'fine' }),
      row('NA', { kind: 'limit', status: 'tooHigh', value: 1.3, prev: 1.1, prevStatus: 'tooHigh' }),
      row('VITC', { value: 1.01, prev: 1 }),
      // Above the need either way: no gap opened or closed, so not the biggest fall.
      row('VITK', { value: 3, prev: 10 }),
      row('ZN', { value: null, prev: 0.2, prevStatus: 'low' }),
    ]);
    const r = weekRecap(rows);
    expect(r.opened).toEqual(['FE']);
    expect(r.tooHigh).toEqual(['NA']);
    expect(r.dropped).toEqual({ id: 'FE', change: expect.closeTo(-0.5), from: 0.9, to: 0.4 });
    expect(r.improved).toBeUndefined();
    expect(r.closed).toEqual([]);
  });
});

describe('trackers', () => {
  const values: Record<string, Record<string, number | null>> = {
    '2026-10-05': { sleep_hours: 7, activity_minutes: 30, plain_water: 1500 },
    '2026-10-06': { sleep_hours: 6, activity_minutes: 0, plain_water: 1000 },
    '2026-10-12': { sleep_hours: 8, activity_minutes: 45, plain_water: 2000 },
    '2026-10-13': { sleep_hours: null, activity_minutes: 15, plain_water: 1000 },
    [today]: { sleep_hours: 7, activity_minutes: 20, plain_water: 250 },
  };
  const data = { today, first: '2026-10-05', days: new Map(Object.entries(values).map(([day, v]) => [day, { values: v }])) } as unknown as InsightData;
  const weeks = weeksEndingAt('2026-10-12', 2, today);

  it('averages over days with a value or adds them up, and leaves today out until it is over', () => {
    expect(trackerWeek({ id: 'sleep_hours', aggregate: 'mean' }, data, weeks[0]!)).toEqual({ value: 6.5, days: 2 });
    expect(trackerWeek({ id: 'sleep_hours', aggregate: 'mean' }, data, weeks[1]!)).toEqual({ value: 8, days: 1 });
    expect(trackerWeek({ id: 'activity_minutes', aggregate: 'sum' }, data, weeks[1]!)).toEqual({ value: 60, days: 2 });
    expect(trackerWeek({ id: 'plain_water', aggregate: 'mean' }, data, weeks[1]!)).toEqual({ value: 1500, days: 2 });
  });

  it('lists only trackers with data, unknown weeks as null', () => {
    const out = trackerWeeks(data, weeksEndingAt('2026-10-12', 3, today));
    expect(out.map((t) => t.id)).toEqual(['sleep_hours', 'activity_minutes', 'plain_water']);
    expect(out[0]!.series).toEqual([null, 6.5, 8]);
    expect(out[0]!.prev).toBe(6.5);
  });
});

describe('suggestBatch', () => {
  const byNutrient = new Map([
    ['FE', { recommended: 10 }],
    ['FOL', { recommended: 300 }],
    ['NA', { recommended: 1500, limitOnly: true }],
  ]) as never;
  const week = new Map([
    ['FE', { status: 'low' as const }],
    ['FOL', { status: 'gettingLow' as const }],
    ['NA', { status: 'tooHigh' as const }],
  ]);
  const recipes: Array<{ name: string; intake: Record<string, number> }> = [
    { name: 'Lentil soup', intake: { FE: 5, FOL: 90, NA: 600 } },
    { name: 'Spinach curry', intake: { FE: 4, FOL: 150, NA: 100 } },
    { name: 'Rice', intake: { FE: 0.1, FOL: 3 } },
  ];
  const portion = (r: (typeof recipes)[number]) => ({ intake: r.intake, missing: [] });

  it('picks the recipe that covers the gaps best without adding to what is too high', () => {
    const s = suggestBatch(recipes, portion, week, { byNutrient })!;
    expect(s.recipe.name).toBe('Spinach curry');
    expect(s.helps.map((h) => h.id)).toEqual(['FOL', 'FE']);
  });

  it('suggests nothing when no recipe helps or nothing is low', () => {
    expect(suggestBatch([recipes[2]!], portion, week, { byNutrient })).toBeUndefined();
    expect(suggestBatch(recipes, portion, new Map(), { byNutrient })).toBeUndefined();
  });
});

describe('got better, got worse', () => {
  const row = (id: string, prev: number, value: number, kind: NutrientWeeks['kind'] = 'rolling', status: NutrientWeeks['status'] = 'fine'): NutrientWeeks => ({
    id,
    kind,
    status,
    value,
    prev,
    prevStatus: 'fine',
    series: [prev, value],
  });
  const rows = new Map(
    [
      row('VITC', 0.61, 0.84),
      row('MG', 0.7, 0.79),
      row('FOL', 1.2, 2.5),
      row('ID', 0.46, 0.38, 'rolling', 'low'),
      row('FASAT', 1.04, 1.18, 'limit', 'tooHigh'),
      row('NA', 0.6, 0.9, 'limit'),
      row('ZN', 0.8, 0.81, 'rolling', 'gettingLow'),
    ].map((r) => [r.id, r]),
  );

  it('counts a need up to 100 % and a limit only above it', () => {
    const { better, worse } = weekMoves(rows);
    expect(better.map((m) => m.id)).toEqual(['VITC', 'MG']);
    // Folate was over the need both weeks; salt stayed under its maximum: neither moved.
    expect(worse.map((m) => m.id)).toEqual(['FASAT', 'ID']);
    expect(worse[0]!.change).toBeCloseTo(-0.14);
    expect(weekMoves(rows, new Set(['VITC'])).better.map((m) => m.id)).toEqual(['MG']);
  });

  it('charts what got worse first, then what is low, over or a bit low', () => {
    const { worse } = weekMoves(rows);
    expect(weekWatch(rows, worse)).toEqual(['FASAT', 'ID', 'ZN']);
    expect(weekWatch(rows, [], new Set(), 2)).toEqual(['ID', 'FASAT']);
  });

  it('numbers weeks as ISO 8601 does', () => {
    expect(isoWeek('2026-10-14')).toBe(42);
    expect(isoWeek('2026-10-19')).toBe(43);
    expect(isoWeek('2026-01-01')).toBe(1);
    // 1 January 2027 is a Friday: it belongs to the last week of 2026.
    expect(isoWeek('2027-01-01')).toBe(53);
  });
});
