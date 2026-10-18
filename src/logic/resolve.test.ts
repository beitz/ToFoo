import { describe, expect, it } from 'vitest';
import { buildFoodDb } from '../foods/foodDb';
import type { BlsFile } from '../foods/blsTypes';
import { defaultProfile } from '../storage/defaults';
import type { Batch, LogEntry } from '../storage/types';
import { activeFast, explicitDayStatus, fastDays, resolveEntry, type ResolveContext } from './resolve';

const bls: BlsFile = {
  format: 'tofoo-bls',
  formatVersion: 1,
  source: 'BLS',
  version: '4.0',
  attribution: '',
  licence: '',
  provenanceCodes: {},
  groups: {},
  nutrients: [
    { id: 'ID', nameEn: 'Iodide', nameDe: 'Iodid', unit: 'µg' },
    { id: 'MET', nameEn: 'Met', nameDe: 'Met', unit: 'g' },
    { id: 'CYSTE', nameEn: 'Cys', nameDe: 'Cys', unit: 'g' },
  ],
  foods: [
    ['R111000', 'Speisesalz', 'Salt', [0, null, null], '---'],
    ['R114000', 'Jodsalz', 'Iodised salt', [2000, null, null], '---'],
    ['H700000', 'Linsen', 'Lentils', [1, 0.2, 0.3], 'AAA'],
  ],
};
const foods = buildFoodDb(bls);
const batch: Batch = {
  id: 'b1',
  schemaVersion: 1,
  recipeId: 'r1',
  recipe: {
    name: 'Linsencurry',
    portions: 4,
    ingredients: [
      { ref: { source: 'BLS', version: '4.0', code: 'H700000' }, name: 'Linsen', grams: 400, preparation: 'boiled' },
      { ref: { source: 'BLS', version: '4.0', code: 'R111000' }, name: 'Salz', grams: 8, preparation: 'asListed', isSalt: true },
    ],
  },
  cookedDay: '2026-10-01',
  cookedAt: 0,
  plan: { fresh: 1, fridge: 1, freezer: 2 },
  remaining: { fresh: 1, fridge: 1, freezer: 2 },
  corrections: [],
};
const ctx: ResolveContext = { foods, products: new Map(), batches: new Map([['b1', batch]]), customFoods: new Map(), salt: { iodised: true, fluoridated: false } };
const log = (o: Partial<LogEntry> & Pick<LogEntry, 'kind'>): LogEntry => ({ id: 'x', schemaVersion: 1, time: 0, day: '2026-10-05', confidence: 'A', label: 'x', ...o }) as LogEntry;

describe('resolve', () => {
  it('computes derived amino acid sums', () => {
    expect(foods.byCode.get('H700000')!.per100.SAA).toBeCloseTo(0.5);
  });

  it('splits a batch into one portion and swaps salt for the kitchen default', () => {
    const e = resolveEntry(log({ kind: 'portion', batchId: 'b1', storage: 'freezer', portions: 1 }), ctx)!;
    expect(e.parts).toHaveLength(2);
    expect(e.parts[0]!.grams).toBe(100);
    expect(e.parts[0]!.storage).toBe('freezer');
    expect(e.parts[1]!.per100.ID).toBe(2000); // iodised
    expect(e.parts[1]!.grams).toBe(2);
  });

  it('counts a serving by grams of the weighed pot, with its own changed ingredients', () => {
    const weighed = new Map([['b1', { ...batch, cookedGrams: 1600 }]]);
    const byWeight = resolveEntry(log({ kind: 'portion', batchId: 'b1', storage: 'fridge', portions: 1, grams: 200 }), { ...ctx, batches: weighed })!;
    expect(byWeight.parts[0]!.grams).toBe(50); // 200 g of a 1600 g pot is an eighth: 50 g of the 400 g lentils
    const lentilsOnly = [batch.recipe.ingredients[0]!];
    const changed = resolveEntry(log({ kind: 'portion', batchId: 'b1', storage: 'fridge', portions: 1, ingredients: lentilsOnly }), ctx)!;
    expect(changed.parts).toHaveLength(1);
    expect(changed.parts[0]!.grams).toBe(100);
  });

  it('turns drinks into meal modifiers', () => {
    const e = resolveEntry(log({ kind: 'drink', drink: 'tea' }), ctx)!;
    expect(e.modifiers).toEqual({ tea: true });
    expect(e.parts).toHaveLength(0);
  });

  it('derives fasting days until the next meal', () => {
    const fast = { id: 'f', schemaVersion: 1, startDay: '2026-10-01' };
    const entries = [log({ kind: 'drink', drink: 'coffee', day: '2026-10-02' }), log({ kind: 'portion', batchId: 'b1', storage: 'fresh', portions: 1, day: '2026-10-04' })];
    expect(fastDays(fast, entries, new Map(), '2026-10-10')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(activeFast([fast], entries, new Map(), '2026-10-10')).toBeUndefined();
    expect(activeFast([fast], [], new Map(), '2026-10-10')).toBe(fast);
    const st = explicitDayStatus([{ day: '2026-10-02', status: 'partial', schemaVersion: 1 }], [fast], entries, new Map(), '2026-10-10');
    expect(st['2026-10-01']).toBe('fasted');
    expect(st['2026-10-02']).toBe('partial');
  });

  it('has a default profile without routine', () => {
    expect(defaultProfile('2026-10-01').outdoorRoutine).toBeUndefined();
  });
});
