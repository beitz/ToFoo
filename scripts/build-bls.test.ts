import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlsFile } from '../src/foods/blsTypes';

const file = resolve(__dirname, '../public/data/bls-4.0.json');

// Requires `npm run data` to have been run (the build and CI do this first).
describe.runIf(existsSync(file))('generated BLS JSON', () => {
  const bls = JSON.parse(readFileSync(file, 'utf8')) as BlsFile;
  const idx = (id: string) => bls.nutrients.findIndex((n) => n.id === id);

  it('records source and version', () => {
    expect(bls.source).toBe('BLS');
    expect(bls.version).toBe('4.0');
    expect(bls.attribution).toContain('Max Rubner-Institut');
  });

  it('contains all foods with aligned values', () => {
    expect(bls.foods.length).toBe(7140);
    for (const f of bls.foods) {
      expect(f[3].length).toBe(bls.nutrients.length);
      expect(f[4].length).toBe(bls.nutrients.length);
    }
  });

  it('keeps known values for oat whole grain', () => {
    const oat = bls.foods.find((f) => f[0] === 'C131000')!;
    expect(oat[1]).toBe('Hafer ganzes Korn, roh');
    expect(oat[2]).toBe('Oat whole grain, raw');
    expect(oat[3][idx('FE')]).toBe(5.16);
    expect(oat[3][idx('MG')]).toBe(116);
    expect(oat[3][idx('VITB12')]).toBe(0); // "Logische Null" is a real zero
  });

  it('keeps missing values as null, not zero', () => {
    const nulls = bls.foods.reduce((n, f) => n + f[3].filter((v) => v === null).length, 0);
    expect(nulls).toBeGreaterThan(1000);
  });

  it('adds selenium estimated from CoFID, marked "C", with its own attribution', () => {
    const se = idx('SE');
    expect(se).toBe(bls.nutrients.length - 1);
    expect(bls.nutrients[se]).toMatchObject({ id: 'SE', unit: 'µg' });
    expect(bls.provenanceCodes.C).toContain('CoFID');
    expect(bls.extraSources?.[0]).toMatchObject({ nutrients: ['SE'], licence: expect.stringContaining('Open Government Licence') });
    const value = (code: string) => {
      const f = bls.foods.find((x) => x[0] === code)!;
      expect(f[4][se]).toBe('C');
      return f[3][se];
    };
    // Plausible against CoFID's own values for the same foods (Brazil nuts 254, cod 23, milk 1 µg/100 g).
    expect(value('H180100')).toBeGreaterThan(150); // Brazil nut
    expect(value('T204100')).toBeGreaterThan(10); // cod, raw
    expect(value('T204100')).toBeLessThan(50);
    expect(value('M111300')).toBeLessThan(5); // whole milk
    expect(value('F110100')).toBe('t'); // apple
    const withValue = bls.foods.filter((f) => f[3][se] !== null).length;
    expect(withValue / bls.foods.length).toBeGreaterThan(0.95);
  });

  it('has the salt variants used for kitchen defaults', () => {
    const codes = new Set(bls.foods.map((f) => f[0]));
    for (const c of ['R111000', 'R114000', 'R113000']) expect(codes.has(c)).toBe(true);
  });
});
