import { describe, expect, it } from 'vitest';
import { portionGrams, rankFoods } from './ranking';
import { resolveRequirements } from './requirements';
import type { NutrientResult } from './simulate';

const req = resolveRequirements({ sex: 'male', birthYear: 1990, weightKg: 75 }, 2026);
const result = (id: string, status: NutrientResult['status'], ulRatio?: number): NutrientResult => ({
  id,
  kind: 'rolling',
  status,
  value: { low: 0.5, central: 0.5, high: 0.5 },
  averageAbsorbed: 0,
  averageIntake: 0,
  ulRatio,
  windowDays: 7,
  knownDays: 7,
  leftOutDays: 0,
  missingDataDays: 0,
  history: [],
  contributors: [],
});

describe('rankFoods', () => {
  it('sizes portions by energy within bounds', () => {
    expect(portionGrams({ ENERCC: 600 })).toBe(50);
    expect(portionGrams({ ENERCC: 20 })).toBe(200);
    expect(portionGrams({ ENERCC: 3000 })).toBe(30);
  });

  it('ranks foods that close several urgent gaps first', () => {
    const results = new Map([
      ['VITC', result('VITC', 'low')],
      ['K', result('K', 'gettingLow')],
      ['VITB12', result('VITB12', 'fine')],
    ]);
    const ranked = rankFoods(
      [
        { key: 'pepper', per100: { ENERCC: 30, VITC: 120, K: 200 } },
        { key: 'banana', per100: { ENERCC: 90, VITC: 10, K: 350 } },
        { key: 'cheese', per100: { ENERCC: 350, VITB12: 2 } },
      ],
      results,
      req,
    );
    expect(ranked.map((r) => r.key)).toEqual(['pepper', 'banana']);
    expect(ranked[0]!.helps[0]!.id).toBe('VITC');
  });

  it('skips foods that would exceed an upper limit', () => {
    const results = new Map([
      ['VITAA', result('VITAA', 'low', 0.9)],
    ]);
    const ranked = rankFoods([{ key: 'liver', per100: { ENERCC: 130, VITAA: 20000, RETOL: 20000 } }, { key: 'carrot', per100: { ENERCC: 40, VITAA: 800, RETOL: 0 } }], results, req);
    expect(ranked.map((r) => r.key)).toEqual(['carrot']);
  });
});
