import { describe, expect, it } from 'vitest';
import type { NutrientResult } from '../../model/simulate';
import { attentionCounts, groupNutrients, nutrientType } from './grouping';

const r = (id: string, status: NutrientResult['status'], central: number): NutrientResult => ({
  id,
  kind: 'rolling',
  status,
  value: { low: central, central, high: central },
  averageAbsorbed: 0,
  averageIntake: 0,
  windowDays: 7,
  knownDays: 7,
  leftOutDays: 0,
  missingDataDays: 0,
  history: [],
  contributors: [],
});

const list = [r('VITC', 'gettingLow', 0.8), r('FE', 'low', 0.5), r('ZN', 'fine', 1.2), r('FASAT', 'tooHigh', 1.6), r('ID', 'low', 0.4)];

describe('home grouping', () => {
  it('by status: most urgent group first, furthest from fine first inside', () => {
    const g = groupNutrients(list, 'status');
    expect(g.map((x) => x.key)).toEqual(['status:tooHigh', 'status:low', 'status:gettingLow', 'status:fine']);
    expect(g[1]!.items.map((x) => x.id)).toEqual(['ID', 'FE']);
  });

  it('by type: vitamins, minerals, then the macronutrient groups', () => {
    expect(nutrientType('VITC')).toBe('vitamins');
    expect(nutrientType('LYS')).toBe('protein');
    expect(nutrientType('FASAT')).toBe('fat');
    const g = groupNutrients(list, 'type');
    expect(g.map((x) => x.id)).toEqual(['vitamins', 'minerals', 'fat']);
    expect(attentionCounts(g[1]!.items)).toEqual([{ status: 'low', n: 2 }]);
  });

  it('none: one list in urgency order', () => {
    expect(groupNutrients(list, 'none')[0]!.items.map((x) => x.id)).toEqual(['FASAT', 'ID', 'FE', 'VITC', 'ZN']);
  });
});
