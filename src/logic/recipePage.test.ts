import { describe, expect, it } from 'vitest';
import type { Food } from '../foods/foodDb';
import { columnsOf, swapCandidates, whoGivesWhat } from './recipePage';

const food = (code: string, nameEn: string, per100: Food['per100']): Food => ({ code, nameEn, nameDe: nameEn, group: code.charAt(0), per100, provenance: {} });

describe('columnsOf', () => {
  it('opens on energy, protein and the gaps', () => {
    expect(
      columnsOf(
        'gaps',
        (id) => id === 'FE' || id === 'VITD',
        () => false,
      ),
    ).toEqual(['ENERCC', 'PROT625', 'VITD', 'FE']);
  });
  it('leaves amino acids out of All', () => {
    const all = columnsOf(
      'all',
      () => false,
      () => false,
    );
    expect(all).toContain('PROT625');
    expect(all).not.toContain('LYS');
  });
  it('lists limits by the given rule', () => {
    expect(
      columnsOf(
        'limits',
        () => false,
        (id) => id === 'FASAT' || id === 'SUGAR',
      ),
    ).toEqual(['FASAT', 'SUGAR']);
  });
});

describe('whoGivesWhat', () => {
  it('gives each ingredient its share of the pot, and keeps unknown apart from none', () => {
    const cells = whoGivesWhat(
      [
        { intake: { FE: 3, VITC: 0 }, missing: [] },
        { intake: { FE: 1 }, missing: ['VITC'] },
      ],
      ['FE', 'VITC'],
    );
    expect(cells[0]![0]!.share).toBeCloseTo(0.75);
    expect(cells[1]![0]!.share).toBeCloseTo(0.25);
    expect(cells[0]![1]).toEqual({ missing: false });
    expect(cells[1]![1]).toEqual({ missing: true });
  });
});

describe('swapCandidates', () => {
  const spinach = food('G211100', 'Spinach raw', { FE: 3, VITC: 50 });
  const foods = [
    spinach,
    food('G210132', 'Spinach boiled', { FE: 4, VITC: 30 }),
    food('G212100', 'Chinese spinach raw', { FE: 5, VITC: 60 }),
    food('G322100', 'Curly kale raw', { FE: 2, VITC: 105 }),
    food('G322200', 'Curly kale deep-frozen', { FE: 2, VITC: 100 }),
    food('G324100', 'Pak choi raw', { FE: 1, VITC: null }),
    food('F503100', 'Banana raw', { FE: 0.3, VITC: 200 }),
  ];
  const gaps = [{ id: 'VITC', weight: 2, recommended: 100, before: 0.3 }];

  it('ranks foods of the same group by what they add to the gaps, skipping variants and other groups', () => {
    const out = swapCandidates(spinach, foods, gaps, 75, () => true);
    expect(out.map((c) => c.food.nameEn)).toEqual(['Curly kale raw']);
    expect(out[0]!.score).toBeCloseTo((2 * (105 - 50) * 75) / 100 / 100);
  });

  it('counts a gap only up to a whole day, and skips foods of another kind', () => {
    const near = [{ ...gaps[0]!, before: 0.9 }];
    expect(swapCandidates(spinach, foods, near, 75, () => true)[0]!.score).toBeCloseTo(2 * 0.1);
    const parsley = food('G900100', 'Parsley dried', { ENERCC: 300, VITC: 500 });
    expect(swapCandidates({ ...spinach, per100: { ...spinach.per100, ENERCC: 23 } }, [parsley], gaps, 75, () => true)).toEqual([]);
  });

  it('does not count a missing value as zero, and respects exclusions', () => {
    expect(swapCandidates(spinach, foods, gaps, 75, (f) => !f.nameEn.includes('kale'))).toEqual([]);
  });

  it('suggests nothing without gaps', () => {
    expect(swapCandidates(spinach, foods, [], 75, () => true)).toEqual([]);
  });
});
