import { describe, expect, it } from 'vitest';
import type { Batch, LogEntry, Recipe } from '../storage/types';
import { checkPortion, describeCheck, describeStatus, excludedFoods, oftenEaten, recipeInfos, topGaps } from './recipeIdeas';

const req = (recommended: number, limitOnly = false) => ({ nutrient: '', kind: 'rda', recommended, physiological: recommended, physiologicalDerived: false, limitOnly, confidence: 'high', source: '' }) as never;
const byNutrient = new Map([
  ['FE', req(15)],
  ['FOL', req(300)],
  ['NA', req(1500, true)],
  ['VITC', req(100)],
  ['CA', req(1000)],
]);

describe('recipe ideas: what one portion gives', () => {
  const portion = { intake: { ENERCC: 520, PROT625: 24.4, FE: 6, FOL: 30, NA: 900, VITC: 80, CA: 50 }, missing: ['FOL'] };
  const status = new Map([
    ['FE', { status: 'low' as const }],
    ['FOL', { status: 'gettingLow' as const }],
    ['NA', { status: 'tooHigh' as const }],
    ['VITC', { status: 'fine' as const }],
    ['CA', { status: 'fine' as const }],
  ]);

  it('splits shares of the daily intake into gaps, too high and rich', () => {
    const c = checkPortion(portion, status, { byNutrient });
    expect(c.kcal).toBe(520);
    expect(c.gaps.map((g) => [g.id, g.status, Math.round(g.share * 100), g.missing])).toEqual([
      ['FE', 'low', 40, false],
      ['FOL', 'gettingLow', 10, true],
    ]);
    expect(c.high.map((h) => [h.id, Math.round(h.share * 100)])).toEqual([['NA', 60]]);
    // Calcium at 5 % is neither a gap nor rich.
    expect(c.rich.map((r) => r.id)).toEqual(['VITC']);
    expect(topGaps(c).map((g) => g.id)).toEqual(['FE', 'FOL']);
  });

  it('words it so the model can quote it, and says where data is missing', () => {
    const text = describeCheck(checkPortion(portion, status, { byNutrient }), 6);
    expect(text).toContain('One portion (1 of 6, after cooking losses): 520 kcal, protein 24 g.');
    expect(text).toContain('Low now: Iron 40 %.');
    expect(text).toContain('Getting low now: Folate');
    expect(text).toContain('(some ingredients have no data, may be more)');
    expect(text).toContain('Already too high (keep these small): Sodium 60 %');
  });

  it('describes the status by group, with what each percentage means', () => {
    const text = describeStatus(
      new Map([
        ['FE', { kind: 'balance' as const, status: 'low' as const, value: { low: 0.5, central: 0.62, high: 0.7 }, windowDays: 14 }],
        ['VITD', { kind: 'tank' as const, status: 'gettingLow' as const, value: { low: 0.3, central: 0.4, high: 0.5 }, windowDays: 30 }],
        ['VITC', { kind: 'rolling' as const, status: 'fine' as const, value: { low: 1, central: 1.2, high: 1.3 }, windowDays: 7 }],
      ]),
    );
    expect(text).toContain('Low: Iron (absorbed about 62 % of the need over 14 days).');
    expect(text).toContain('Getting low: Vitamin D (store about 40 % full).');
    expect(text).toContain('Enough: Vitamin C.');
  });
});

describe('recipe ideas: what the user eats and keeps', () => {
  it('counts the foods logged most in the period', () => {
    const e = (day: string, label: string) => ({ kind: 'food', day, label }) as LogEntry;
    const log = [e('2026-10-17', 'Oats'), e('2026-10-16', 'Oats'), e('2026-10-15', 'Apple'), e('2026-08-01', 'Old food')];
    expect(oftenEaten(log, '2026-10-18', 30)).toEqual(['Oats (2×)', 'Apple (1×)']);
  });

  it('lists recipes with batches cooked lately and portions in stock, archived ones left out', () => {
    const r = (id: string, archived = false) => ({ id, name: id, portions: 4, ingredients: [], tags: [], createdAt: 0, updatedAt: 0, schemaVersion: 1, ...(archived ? { archived } : {}) }) as Recipe;
    const lentils = { ref: { source: 'BLS' as const, version: '4.0', code: 'H700000' }, name: 'Lentils', grams: 400, preparation: 'boiled' as const };
    const b = (id: string, cookedDay: string, freezer: number, cookedAt: number, more: Partial<Batch> = {}) =>
      ({ id, recipeId: 'dal', cookedDay, cookedAt, recipe: { name: 'dal', portions: 4, ingredients: [lentils] }, remaining: { fresh: 0, fridge: 0, freezer }, ...more }) as Batch;
    const batches = [b('new', '2026-10-01', 3, 2, { cookedGrams: 1600, recipeIngredients: [{ ...lentils, grams: 300 }] }), b('old', '2026-06-01', 1, 1), b('gone', '2026-09-01', 0, 3)];
    const infos = recipeInfos([r('dal'), r('old', true)], batches, '2026-10-18');
    expect(infos.map((i) => [i.id, i.cookedLately, i.inStock])).toEqual([['dal', 2, 4]]);
    // Batches with portions left, oldest first, with their weight and whether the pot differed.
    expect(infos[0]!.stock.map((s) => [s.id, s.cookedGrams, s.changed])).toEqual([
      ['old', undefined, false],
      ['new', 1600, true],
    ]);
  });

  it('finds excluded foods by food and by group', () => {
    const foods = [
      { code: 'A1', group: 'A', nameEn: 'Peanuts' },
      { code: 'B1', group: 'B', nameEn: 'Shrimp' },
      { code: 'C1', group: 'C', nameEn: 'Rice' },
    ];
    expect(excludedFoods(foods, { groups: ['B'], foods: ['A1'] })).toEqual(['Peanuts', 'Shrimp']);
  });
});
