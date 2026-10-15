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

  it('has the salt variants used for kitchen defaults', () => {
    const codes = new Set(bls.foods.map((f) => f[0]));
    for (const c of ['R111000', 'R114000', 'R113000']) expect(codes.has(c)).toBe(true);
  });
});
