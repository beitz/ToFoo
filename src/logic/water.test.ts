import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '../model/types';
import { buildFoodDb } from '../foods/foodDb';
import type { BlsFile } from '../foods/blsTypes';
import type { CustomFood, WaterRecord } from '../storage/types';
import { canBeWater, dayWater, dayWaterMinerals, labelNutrients, labelValues, labelWater, waterEntries, waterTarget } from './water';
import type { ResolveContext } from './resolve';

const entry = (o: Partial<ModelEntry>): ModelEntry => ({ id: 'e', label: 'x', time: 0, dayKey: '2026-10-17', confidence: 'B', isSupplement: false, parts: [], ...o });
const part = (grams: number, WATER: number | null | 't') => ({ label: 'f', grams, per100: { WATER }, preparation: 'asListed' as const, storage: 'fresh' as const });

describe('water', () => {
  it('adds plain water and the water in foods, and counts what has no water value', () => {
    const entries = [
      entry({ parts: [part(200, 87), part(50, null)] }), // yogurt 174 ml, a product without water data
      entry({ parts: [part(10, 't')] }),
      entry({ isSupplement: true, direct: {}, modifiers: { coffee: true } }), // coffee mark, no amount
      entry({ isSupplement: true, direct: { VITD: 20 } }), // a vitamin D pill
      entry({ dayKey: '2026-10-16', parts: [part(500, 100)] }),
    ];
    const water = [
      { id: 'w1', schemaVersion: 1, time: 0, day: '2026-10-17', ml: 500 },
      { id: 'w2', schemaVersion: 1, time: 0, day: '2026-10-16', ml: 250 },
    ];
    expect(dayWater('2026-10-17', entries, water)).toEqual({ plainMl: 500, foodMl: 174, totalMl: 674, unknown: 2 });
  });

  it('compares with DGE drinks plus food water for the age group', () => {
    expect(waterTarget('19-24')).toBe(2360);
    expect(waterTarget('25-50')).toBe(2270);
    expect(waterTarget('65+')).toBe(1990);
  });
});

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
    { id: 'CA', nameEn: 'Calcium', nameDe: 'Calcium', unit: 'mg' },
    { id: 'MG', nameEn: 'Magnesium', nameDe: 'Magnesium', unit: 'mg' },
    { id: 'WATER', nameEn: 'Water', nameDe: 'Wasser', unit: 'g' },
    { id: 'ENERCC', nameEn: 'Energy', nameDe: 'Energie', unit: 'kcal' },
  ],
  foods: [
    ['N120000', 'Natürliches Mineralwasser', 'Natural mineral water', [10, 3.3, 100, 0], 'AAAA'],
    ['N0A1000', 'Nearwater mit Fruchtsaft', 'Nearwater with fruit juice', [10, 3.2, 95.6, 18], 'AAAA'],
  ],
};
const foods = buildFoodDb(bls);
const klar: CustomFood = labelWater('klar', 'klar Medium ', { CA: 240, MG: 109, FD: 0.2 }, 0);
const ctx: ResolveContext = { foods, products: new Map(), batches: new Map(), customFoods: new Map([['klar', klar]]), salt: { iodised: true, fluoridated: false } };
const rec = (o: Partial<WaterRecord>): WaterRecord => ({ id: 'w', schemaVersion: 1, time: new Date(2026, 10, 20, 12).getTime(), day: '2026-11-20', ml: 1000, ...o });
const named = () => 'Mineral water';

describe('water of a known kind', () => {
  it('keeps label values per litre in the model units and reads them back', () => {
    expect(klar).toMatchObject({ name: 'klar Medium', servingGrams: 1000, water: true, nutrients: { CA: 240, MG: 109, FD: 200 } });
    expect(labelValues(klar)).toEqual({ CA: 240, MG: 109, FD: 0.2 });
    expect(labelNutrients({ CA: 240, MG: undefined, NA: -1 })).toEqual({ CA: 240 });
  });

  it('turns water with a label or a food into minerals for its ml, never plain water', () => {
    const entries = waterEntries(
      [rec({ id: 'a', ml: 500, water: { source: 'custom', id: 'klar' } }), rec({ id: 'b', water: { source: 'BLS', version: '4.0', code: 'N120000' } }), rec({ id: 'c' }), rec({ id: 'd', water: { source: 'custom', id: 'gone' } })],
      ctx,
      named,
    );
    expect(entries.map((e) => e.id)).toEqual(['water:a', 'water:b']);
    expect(entries[0]).toMatchObject({ label: 'klar Medium', water: true, isSupplement: false, direct: { CA: 120, MG: 54.5, FD: 100 }, parts: [] });
    expect(entries[1]).toMatchObject({ label: 'Mineral water', water: true, parts: [{ grams: 1000 }] });
    expect(dayWaterMinerals('2026-11-20', entries)).toEqual({ CA: 220, MG: 87.5 });
  });

  it('spreads a bottle logged when empty over its days', () => {
    const from = new Date(2026, 10, 19, 12).getTime();
    const entries = waterEntries([rec({ from, water: { source: 'custom', id: 'klar' } })], ctx, named);
    expect(entries.map((e) => [e.id, e.dayKey, e.spread])).toEqual([
      ['water:w@2026-11-19', '2026-11-19', true],
      ['water:w@2026-11-20', '2026-11-20', true],
    ]);
    expect(entries[0]!.direct!.CA).toBeCloseTo(120);
  });

  it('does not count its water twice in the water total', () => {
    const entries = waterEntries([rec({ water: { source: 'BLS', version: '4.0', code: 'N120000' } })], ctx, named);
    expect(dayWater('2026-11-20', entries, [rec({ water: { source: 'BLS', version: '4.0', code: 'N120000' } })])).toEqual({ plainMl: 1000, foodMl: 0, totalMl: 1000, unknown: 0 });
  });

  it('takes only foods without energy to speak of as water', () => {
    expect(canBeWater(foods.byCode.get('N120000')!)).toBe(true);
    expect(canBeWater(foods.byCode.get('N0A1000')!)).toBe(false);
    expect(canBeWater({ per100: {} })).toBe(true);
  });
});
