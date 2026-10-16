import { describe, expect, it } from 'vitest';
import type { Product } from '../storage/types';
import type { BlsFile } from './blsTypes';
import { buildFoodDb } from './foodDb';
import { matchQueries, productFood, productLabel } from './products';
import { resolveEntry, type ResolveContext } from '../logic/resolve';

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
    { id: 'ENERCC', nameEn: 'Energy', nameDe: 'Energie', unit: 'kcal' },
    { id: 'FAT', nameEn: 'Fat', nameDe: 'Fett', unit: 'g' },
    { id: 'MG', nameEn: 'Magnesium', nameDe: 'Magnesium', unit: 'mg' },
    { id: 'VITB12', nameEn: 'B12', nameDe: 'B12', unit: 'µg' },
  ],
  foods: [['S610000', 'Pralinen', 'Pralines', [555, 35, 90, null], 'AAAA']],
};
const foods = buildFoodDb(bls);

const giotto: Product = {
  id: 'OFF:8000500319475',
  schemaVersion: 1,
  source: 'OFF',
  code: '8000500319475',
  name: 'GiOTTO Haselnuss',
  brand: 'Ferrero',
  per100: { ENERCC: 632, FAT: 48 },
  categories: ['Snacks', 'Chocolate candies', 'Nut confectioneries'],
  fetchedAt: 0,
};

describe('products as foods', () => {
  it('uses label values and borrows the rest from the matched BLS food', () => {
    const f = productFood({ ...giotto, match: { version: '4.0', code: 'S610000' } }, foods);
    expect(f.code).toBe('OFF:8000500319475');
    expect(f.group).toBe('S');
    expect(f.per100).toMatchObject({ ENERCC: 632, FAT: 48, MG: 90, VITB12: null });
    expect(f.provenance).toMatchObject({ ENERCC: 'B', FAT: 'B', MG: 'U', VITB12: '-' });
  });

  it('leaves everything off the label missing without a match', () => {
    const f = productFood(giotto, foods);
    expect(f.per100.MG).toBeUndefined();
    expect(f.group).toBe('');
  });

  it('returns the same object for the same record (model caches rely on it)', () => {
    expect(productFood(giotto, foods)).toBe(productFood(giotto, foods));
  });

  it('names the brand once and suggests specific categories first', () => {
    expect(productLabel(giotto)).toBe('GiOTTO Haselnuss · Ferrero');
    expect(productLabel({ name: 'Giotto Haselnuss', brand: 'Ferrero, Giotto' })).toBe('Giotto Haselnuss · Ferrero');
    expect(productLabel({ name: 'Ferrero Küsschen', brand: 'Ferrero' })).toBe('Ferrero Küsschen');
    expect(matchQueries(giotto, 2)).toEqual(['Nut confectioneries', 'Chocolate candies']);
  });

  it('resolves logged products for the model', () => {
    const ctx: ResolveContext = { foods, products: new Map([[giotto.code, giotto]]), batches: new Map(), customFoods: new Map(), salt: { iodised: true, fluoridated: false } };
    const e = resolveEntry({ id: '1', schemaVersion: 1, time: 0, day: '2026-10-16', confidence: 'A', label: 'Giotto', kind: 'food', ref: { source: 'OFF', code: giotto.code }, grams: 4.3, preparation: 'asListed' }, ctx)!;
    expect(e.parts[0]).toMatchObject({ grams: 4.3, nameEn: 'GiOTTO Haselnuss', per100: { ENERCC: 632 } });
    const unknown = resolveEntry({ id: '2', schemaVersion: 1, time: 0, day: '2026-10-16', confidence: 'A', label: 'x', kind: 'food', ref: { source: 'OFF', code: '1' }, grams: 1, preparation: 'asListed' }, ctx);
    expect(unknown).toBeNull();
  });
});
