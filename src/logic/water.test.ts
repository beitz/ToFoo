import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '../model/types';
import { dayWater, waterTarget } from './water';

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
