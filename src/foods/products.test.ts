import { describe, expect, it } from 'vitest';
import type { Product } from '../storage/types';
import type { BlsFile } from './blsTypes';
import { buildFoodDb } from './foodDb';
import { needsCheck, productFood, productLabel } from './products';
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

  it('uses USDA generic values as database values and fills only the gaps from the match', () => {
    const tofu: Product = {
      id: 'USDA:172475',
      schemaVersion: 1,
      source: 'USDA',
      usdaType: 'SR Legacy',
      code: '172475',
      name: 'Tofu, raw, firm',
      per100: { ENERCC: 144, MG: 58, MET: 0.2, CYSTE: 0.1 },
      categories: ['Legumes and Legume Products', 'Tofu'],
      fetchedAt: 0,
    };
    const alone = productFood(tofu, foods);
    expect(alone.code).toBe('USDA:172475');
    expect(alone.group).toBe('H'); // from the USDA category, for the phytate rule
    expect(alone.provenance).toMatchObject({ ENERCC: 'D', MG: 'D' });
    expect(alone.per100.SAA).toBeCloseTo(0.3);
    const filled = productFood({ ...tofu, match: { version: '4.0', code: 'S610000' } }, foods);
    expect(filled.per100).toMatchObject({ MG: 58, FAT: 35, VITB12: null });
    expect(filled.provenance).toMatchObject({ MG: 'D', FAT: 'U' });
    expect(filled.group).toBe('S');
  });

  it('returns the same object for the same record (model caches rely on it)', () => {
    expect(productFood(giotto, foods)).toBe(productFood(giotto, foods));
  });

  it('names the brand once and suggests specific categories first', () => {
    expect(productLabel(giotto)).toBe('GiOTTO Haselnuss · Ferrero');
    expect(productLabel({ name: 'Giotto Haselnuss', brand: 'Ferrero, Giotto' })).toBe('Giotto Haselnuss · Ferrero');
    expect(productLabel({ name: 'Ferrero Küsschen', brand: 'Ferrero' })).toBe('Ferrero Küsschen');
  });

  it('asks for a check of pairs the app picked and of products without one', () => {
    expect(needsCheck(giotto)).toBe(true);
    expect(needsCheck({ ...giotto, match: { version: '4.0', code: 'S610000', auto: true } })).toBe(true);
    expect(needsCheck({ ...giotto, match: { version: '4.0', code: 'S610000' } })).toBe(false);
    expect(needsCheck({ ...giotto, labelOnly: true })).toBe(false);
    // USDA generic foods have their own vitamins and minerals.
    expect(needsCheck({ ...giotto, source: 'USDA', usdaType: 'Foundation' })).toBe(false);
    expect(needsCheck({ ...giotto, source: 'USDA', usdaType: 'Branded' })).toBe(true);
  });

  it('resolves logged products for the model', () => {
    const ctx: ResolveContext = { foods, products: new Map([[giotto.id, giotto]]), batches: new Map(), customFoods: new Map(), salt: { iodised: true, fluoridated: false } };
    const e = resolveEntry({ id: '1', schemaVersion: 1, time: 0, day: '2026-10-16', confidence: 'A', label: 'Giotto', kind: 'food', ref: { source: 'OFF', code: giotto.code }, grams: 4.3, preparation: 'asListed' }, ctx)!;
    expect(e.parts[0]).toMatchObject({ grams: 4.3, nameEn: 'GiOTTO Haselnuss', per100: { ENERCC: 632 } });
    const usda: Product = { ...giotto, id: 'USDA:8000500319475', source: 'USDA', usdaType: 'Branded', per100: { ENERCC: 500 } };
    const both: ResolveContext = { ...ctx, products: new Map([[giotto.id, giotto], [usda.id, usda]]) };
    const fromUsda = resolveEntry({ id: '3', schemaVersion: 1, time: 0, day: '2026-10-16', confidence: 'A', label: 'x', kind: 'food', ref: { source: 'USDA', code: usda.code }, grams: 10, preparation: 'asListed' }, both)!;
    expect(fromUsda.parts[0]!.per100.ENERCC).toBe(500);
    const unknown = resolveEntry({ id: '2', schemaVersion: 1, time: 0, day: '2026-10-16', confidence: 'A', label: 'x', kind: 'food', ref: { source: 'OFF', code: '1' }, grams: 1, preparation: 'asListed' }, ctx);
    expect(unknown).toBeNull();
  });
});
