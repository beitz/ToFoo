import { describe, expect, it } from 'vitest';
import type { RawValue } from '../model/types';
import type { Food } from './foodDb';
import { aminoProfiles, fatProfile } from './groupStats';

function food(code: string, per100: Record<string, RawValue>): Food {
  return { code, nameDe: code, nameEn: code, group: code.charAt(0), per100, provenance: {} };
}

describe('amino acids by kind of food', () => {
  const foods = [
    food('C131000', { PROT625: 10, LYS: 0.3 }), // 30 mg/g
    food('C132000', { PROT625: 10, LYS: 0.4 }), // 40 mg/g
    food('B111000', { PROT625: 10, LYS: 0.5 }), // 50 mg/g
    food('C133000', { PROT625: 1, LYS: 0.09 }), // too little protein: left out
    food('C134000', { PROT625: 10, LYS: null }), // missing: left out, not zero
    food('H701000', { PROT625: 20, LYS: 1.4 }), // legumes 70 mg/g
    food('U201000', { PROT625: 20, LYS: 1.8 }), // animal 90 mg/g
    food('E401000', { PROT625: 12, LYS: 0.3 }), // pasta: no kind
  ];
  const byKind = Object.fromEntries(aminoProfiles(foods, ['LYS']).map((p) => [p.kind, p]));

  it('takes the median per g protein, skipping missing values and low-protein foods', () => {
    expect(byKind.grains?.mgPerG.LYS).toBeCloseTo(40);
    expect(byKind.grains?.foods).toBe(4);
    expect(byKind.legumes?.mgPerG.LYS).toBeCloseTo(70);
    expect(byKind.animal?.mgPerG.LYS).toBeCloseTo(90);
  });

  it('leaves a kind without data empty instead of zero', () => {
    expect(byKind.nuts?.foods).toBe(0);
    expect(byKind.nuts?.mgPerG.LYS).toBeUndefined();
  });
});

describe('fatty acid shares', () => {
  it('gives shares of all fatty acids', () => {
    const p = fatProfile(food('Q120000', { FASAT: 12, FAMS: 74.7, FAPU: 7.4, FAPUN3: 0.7 }));
    expect(p.saturated! + p.mono! + p.poly!).toBeCloseTo(1);
    expect(p.mono).toBeCloseTo(74.7 / 94.1);
    expect(p.omega3).toBeCloseTo(0.7 / 94.1);
  });

  it('shows nothing when a part is missing', () => {
    expect(fatProfile(food('Q999999', { FASAT: 12, FAMS: null, FAPU: 7 }))).toEqual({ code: 'Q999999' });
  });
});
