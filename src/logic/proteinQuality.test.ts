import { describe, expect, it } from 'vitest';
import type { RawValue } from '../model/types';
import type { Food } from '../foods/foodDb';
import { aminoScore, aminoTotals, complement, lowestAmino, pdcaas, scoreTable } from './proteinQuality';
import { proteinDigestibility } from '../../model/proteinQuality';

function food(code: string, per100: Record<string, RawValue>): Food {
  return { code, nameDe: code, nameEn: code, group: code.charAt(0), per100, provenance: {} };
}

// A two-amino-acid pattern keeps the arithmetic readable: mg per g protein.
const pattern = { LYS: 45, SAA: 22 };
// Grain-like: 10 g protein, lysine 25 mg/g (0.56 of need), sulphur 40 mg/g.
const grain = food('B101000', { PROT625: 10, LYS: 0.25, SAA: 0.4 });
// Legume-like: 10 g protein, lysine 70 mg/g, sulphur 18 mg/g (0.82 of need).
const legume = food('H730132', { PROT625: 10, LYS: 0.7, SAA: 0.18 });

describe('amino acid score', () => {
  it('finds the lowest amino acid per g protein against the pattern', () => {
    const s = aminoScore(aminoTotals([{ food: grain, grams: 100 }], ['LYS', 'SAA'])!, pattern);
    expect(s.limiting).toBe('LYS');
    expect(s.score).toBeCloseTo(25 / 45);
  });

  it('scores a mix from its summed amino acids, so two poor proteins can make a good one', () => {
    const c = complement(
      [
        { code: 'H730132', grams: 100 },
        { code: 'B101000', grams: 100 },
      ],
      new Map([
        ['H730132', legume],
        ['B101000', grain],
      ]),
      pattern,
    )!;
    expect(c.parts[0]!.score.limiting).toBe('SAA');
    expect(c.parts[1]!.score.limiting).toBe('LYS');
    // (0.7 + 0.25) / 20 g = 47.5 mg/g lysine; (0.18 + 0.4) / 20 = 29 mg/g sulphur
    expect(c.together.score).toBeCloseTo(47.5 / 45);
    expect(c.together.score).toBeGreaterThan(Math.max(c.parts[0]!.score.score, c.parts[1]!.score.score));
  });

  it('gives no score when a value is missing, instead of counting it as zero', () => {
    expect(aminoTotals([{ food: food('X', { PROT625: 10, LYS: null, SAA: 0.3 }), grams: 100 }], ['LYS', 'SAA'])).toBeUndefined();
    expect(aminoTotals([{ food: food('X', { PROT625: 0, LYS: 0, SAA: 0 }), grams: 100 }], ['LYS', 'SAA'])).toBeUndefined();
  });
});

describe('PDCAAS', () => {
  it('cuts the amino acid score at 1 before multiplying, so it never passes the digestibility', () => {
    expect(pdcaas(1.4, 97)).toBeCloseTo(0.97);
    expect(pdcaas(0.5, 86)).toBeCloseTo(0.43);
  });

  it('builds the table from WHO rows with their BLS foods, leaving out foods without data', () => {
    const rows = [
      { key: 'a', pct: 90, bls: 'B101000' },
      { key: 'b', pct: 80, bls: 'H730132' },
      { key: 'c', pct: 99, bls: 'nope' },
    ];
    const table = scoreTable(
      rows,
      new Map([
        ['B101000', grain],
        ['H730132', legume],
      ]),
      pattern,
    );
    expect(table.map((r) => r.row.key)).toEqual(['b', 'a']);
    expect(table[0]!.pdcaas).toBeCloseTo((18 / 22) * 0.8);
  });

  it('has a sourced digestibility between 0 and 100 % and a BLS food for every row', () => {
    for (const r of proteinDigestibility.value) {
      expect(r.pct, r.key).toBeGreaterThan(50);
      expect(r.pct, r.key).toBeLessThanOrEqual(100);
      expect(r.bls, r.key).toMatch(/^[A-Z][0-9A-Z]{6}$/);
    }
  });
});

describe('lowest amino acid', () => {
  it('skips amino acids without data', () => {
    expect(
      lowestAmino([
        { id: 'LYS', share: 1.2 },
        { id: 'SAA', share: undefined },
        { id: 'TRP', share: 0.9 },
      ]),
    ).toEqual({ id: 'TRP', share: 0.9 });
    expect(lowestAmino([{ id: 'LYS', share: undefined }])).toBeUndefined();
  });
});
