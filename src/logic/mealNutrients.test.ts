import { describe, expect, it } from 'vitest';
import type { MealSummary } from '../model/simulate';
import type { FoodPart, ModelEntry } from '../model/types';
import type { LogEntry } from '../storage/types';
import { biggestShares, breakdown, composition, entryWeight, partSource, shareRows } from './mealNutrients';

const part = (label: string, grams: number, per100: FoodPart['per100']): FoodPart => ({ label, grams, per100, preparation: 'raw', storage: 'fresh' });
const entry = (id: string, parts: FoodPart[], extra: Partial<ModelEntry> = {}): ModelEntry => ({
  id,
  label: id,
  time: 0,
  dayKey: '2026-10-21',
  confidence: 'A',
  isSupplement: false,
  parts,
  ...extra,
});

// A snack: 50 g nuts (no vitamin C data) and an orange; absorbed amounts as the model would give them.
const nuts = entry('nuts', [part('Nuts', 50, { ENERCC: 600, FE: 3, VITC: null, NA: 10 })]);
const orange = entry('orange', [part('Orange', 150, { ENERCC: 40, FE: 0.2, VITC: 50, NA: 0 })]);
const curry = entry('curry', [part('Lentils', 100, { ENERCC: 120, FE: 2.4, VITC: 0 }), part('Spinach', 50, { ENERCC: 20, FE: 4, VITC: 30 })]);
const entries = new Map([nuts, orange, curry].map((e) => [e.id, e]));
const meals: MealSummary[] = [
  // Intake: FE 1.5 + 0.3 = 1.8 mg, of which 0.36 mg absorbed.
  { day: '2026-10-21', start: 0, entryIds: ['nuts', 'orange'], intake: { ENERCC: 360, FE: 1.8, VITC: 75, NA: 5 }, absorbed: { ENERCC: 360, FE: 0.36, VITC: 60, NA: 5 } },
  // Intake: FE 2.4 + 2 = 4.4 mg, of which 0.44 mg absorbed.
  { day: '2026-10-21', start: 0, entryIds: ['curry'], intake: { ENERCC: 130, FE: 4.4, VITC: 15 }, absorbed: { ENERCC: 130, FE: 0.44, VITC: 12 } },
];
const opts = { retention: false };

const req = (recommended: number, physiological: number, limitOnly = false) => ({ recommended, physiological, limitOnly }) as never;
const requirements = {
  byNutrient: new Map([
    ['ENERCC', req(2000, 2000)],
    ['FE', req(10, 1)],
    ['VITC', req(100, 80)],
    ['NA', req(1500, 1500, true)],
  ]),
  infoOnly: new Set<string>(),
};

describe('nutrients of one meal', () => {
  it('adds up the entries of a meal: their intake and the meal’s absorbed amount', () => {
    const b = breakdown([{ entryId: 'nuts' }, { entryId: 'orange' }], entries, meals, opts);
    expect(b.intake.FE).toBeCloseTo(1.8);
    expect(b.absorbed.FE).toBeCloseTo(0.36);
    expect(b.intake.ENERCC).toBeCloseTo(360);
    expect(b.absorbedKnown).toBe(true);
  });

  it('splits the meal’s absorbed amount over its entries by their share of the intake', () => {
    const b = breakdown([{ entryId: 'nuts' }], entries, meals, opts);
    // 1.5 of 1.8 mg iron eaten → 5/6 of the 0.36 mg absorbed.
    expect(b.absorbed.FE).toBeCloseTo(0.3);
    const o = breakdown([{ entryId: 'orange' }], entries, meals, opts);
    expect(b.absorbed.FE! + o.absorbed.FE!).toBeCloseTo(0.36);
  });

  it('shows one ingredient of a recipe portion on its own', () => {
    const spinach = breakdown([{ entryId: 'curry', part: 1 }], entries, meals, opts);
    expect(spinach.intake.FE).toBeCloseTo(2);
    expect(spinach.absorbed.FE).toBeCloseTo(0.2);
    expect(spinach.intake.ENERCC).toBeCloseTo(10);
    expect(breakdown([{ entryId: 'curry', part: 5 }], entries, meals, opts).unresolved).toBe(1);
  });

  it('shares mean what they mean on Home: absorbed ÷ absorbed need, intake ÷ limit', () => {
    const rows = shareRows(breakdown([{ entryId: 'nuts' }, { entryId: 'orange' }], entries, meals, opts), ['FE', 'VITC', 'NA'], requirements);
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get('FE')!.share).toBeCloseTo(0.36); // 0.36 mg absorbed of 1 mg absorbed need
    expect(by.get('FE')!.kind).toBe('need');
    expect(by.get('NA')!.kind).toBe('limit');
    expect(by.get('NA')!.share).toBeCloseTo(5 / 1500);
  });

  it('missing is not zero: "≥" when some food lacks data, "–" when none has any', () => {
    const both = shareRows(breakdown([{ entryId: 'nuts' }, { entryId: 'orange' }], entries, meals, opts), ['VITC'], requirements)[0]!;
    expect(both.partial).toBe(true);
    expect(both.noData).toBe(false);
    const nutsOnly = shareRows(breakdown([{ entryId: 'nuts' }], entries, meals, opts), ['VITC'], requirements)[0]!;
    expect(nutsOnly.noData).toBe(true);
    expect(nutsOnly.share).toBeUndefined();
  });

  it('gives amounts but no share for entries the model has no meal for', () => {
    const b = breakdown([{ entryId: 'nuts' }], entries, [], opts);
    expect(b.absorbedKnown).toBe(false);
    expect(b.intake.FE).toBeCloseTo(1.5);
    expect(shareRows(b, ['FE'], requirements)[0]!.share).toBeUndefined();
    expect(breakdown([{ entryId: 'gone' }], entries, meals, opts).unresolved).toBe(1);
  });

  it('nutrients without a reference value are amounts only', () => {
    const row = shareRows(breakdown([{ entryId: 'nuts' }], entries, meals, opts), ['FE'], { byNutrient: new Map(), infoOnly: new Set() })[0]!;
    expect(row.kind).toBe('info');
    expect(row.share).toBeUndefined();
    expect(row.amount).toBeCloseTo(1.5);
  });

  it('names the biggest shares of the need, leaving out energy and limits', () => {
    const rows = shareRows(breakdown([{ entryId: 'nuts' }, { entryId: 'orange' }], entries, meals, opts), ['ENERCC', 'FE', 'VITC', 'NA'], requirements);
    expect(biggestShares(rows).map((r) => r.id)).toEqual(['VITC', 'FE']);
  });

  it('per 100 g: the item’s own make-up, against the reference intake (as on the food page)', () => {
    const b = breakdown([{ entryId: 'nuts' }], entries, meals, opts);
    const rows = shareRows(b, ['FE', 'NA', 'VITC'], requirements, 'per100', 50);
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get('FE')!.amount).toBeCloseTo(3); // 1.5 mg in 50 g
    expect(by.get('FE')!.share).toBeCloseTo(0.3); // 3 mg of a 10 mg reference intake, not absorbed
    expect(by.get('NA')!.share).toBeCloseTo(10 / 1500);
    expect(by.get('VITC')!.noData).toBe(true);
  });

  it('what 100 g is made of, and nothing for the rest when a part is unknown', () => {
    const b = { intake: { CHO: 17, SUGAR: 10, PROT625: 1.5, FAT: 0.1, FIBT: 0 }, absorbed: {}, missing: new Set<string>(), unresolved: 0, absorbedKnown: true, sources: {} };
    const c = composition(b, 22)!;
    expect(c.parts.find((p) => p.id === 'CHO')!.share).toBeCloseTo(17 / 22);
    expect(c.sugar).toBeCloseTo(10 / 22);
    expect(c.rest).toBeCloseTo(1 - 18.6 / 22);
    const noFibre = composition({ ...b, intake: { ...b.intake, FIBT: undefined as never }, missing: new Set(['FIBT']) }, 22)!;
    expect(noFibre.parts.find((p) => p.id === 'FIBT')!.noData).toBe(true);
    expect(noFibre.rest).toBeUndefined();
    expect(composition(b, 0)).toBeUndefined();
  });

  it('weighs an entry: grams, a share of the weighed pot, else the raw ingredients', () => {
    const base = { id: 'x', time: 0, day: '2026-10-21', confidence: 'A', label: 'x', schemaVersion: 1 } as const;
    expect(entryWeight({ ...base, kind: 'food', ref: { source: 'BLS', version: '4.0', code: 'X' }, grams: 22, preparation: 'raw' }, {})).toEqual({ grams: 22, raw: false });
    const portion = { ...base, kind: 'portion', batchId: 'b', storage: 'fresh', portions: 1 } as LogEntry;
    const recipe = { name: 'Curry', portions: 4, ingredients: [] };
    expect(entryWeight(portion, { batch: { cookedGrams: 2000, recipe } })).toEqual({ grams: 500, raw: false });
    expect(entryWeight(portion, { batch: { recipe }, parts: [{ grams: 75 }, { grams: 100 }] })).toEqual({ grams: 175, raw: true });
    expect(entryWeight({ ...base, kind: 'manual', isSupplement: false, nutrients: {} } as LogEntry, {})).toBeUndefined();
  });

  it('the serving: what was eaten, against the reference intake', () => {
    const rows = shareRows(breakdown([{ entryId: 'nuts' }], entries, meals, opts), ['FE', 'NA'], requirements, 'serving');
    expect(rows[0]!.amount).toBeCloseTo(1.5);
    expect(rows[0]!.share).toBeCloseTo(0.15); // 1.5 mg of a 10 mg reference intake
    expect(rows[1]!.share).toBeCloseTo(5 / 1500);
  });

  it('says where each value comes from: BLS, a product label, its similar BLS food, or the user', () => {
    const gummy = { code: 'OFF:4001686301265', per100: { CHO: 77, FE: 0.1, VITC: null }, provenance: { CHO: 'B', FE: 'U' } };
    expect(partSource(gummy, 'CHO')).toBe('O');
    expect(partSource(gummy, 'FE')).toBe('B');
    expect(partSource(gummy, 'VITC')).toBeUndefined();
    expect(partSource({ code: 'USDA:123', per100: { FE: 1 }, provenance: { FE: 'D' } }, 'FE')).toBe('U');
    expect(partSource({ code: 'H130100', per100: { FE: 3 } }, 'FE')).toBe('B');
    const label = entry('label', [], { direct: { NA: 200 } });
    const withGummy = new Map([...entries, ['gummy', entry('gummy', [{ ...part('Goldbären', 22, gummy.per100), ...gummy }])], ['label', label]]);
    const b = breakdown([{ entryId: 'nuts' }, { entryId: 'gummy' }, { entryId: 'label' }], withGummy, meals, opts);
    expect([...b.sources.FE!].sort()).toEqual(['B']);
    expect([...(b.sources.CHO ?? [])]).toEqual(['O']);
    expect([...b.sources.NA!].sort()).toEqual(['B', 'E']);
  });
});
