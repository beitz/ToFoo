import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from '../storage/types';
import type { BlsFile } from './blsTypes';
import { buildFoodDb, groupSearchBoost } from './foodDb';
import { autoMatches, bestMatch, initialChoice, withChoice, wantsAutoMatch } from './productMatch';
import { buildIndex } from './search';

const product = (name: string, brand: string, categories: string[], extra: Partial<Product> = {}): Product => ({
  id: `OFF:${name}`,
  schemaVersion: 1,
  source: 'OFF',
  code: '1',
  name,
  brand,
  per100: { ENERCC: 500 },
  categories,
  fetchedAt: 0,
  ...extra,
});

const file = resolve(__dirname, '../../public/data/bls-4.0.json');
describe.runIf(existsSync(file))('pairing products with a similar BLS food', () => {
  const db = buildFoodDb(JSON.parse(readFileSync(file, 'utf8')) as BlsFile);
  const index = buildIndex(db.foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe })));
  const boost = (key: string) => groupSearchBoost(key.charAt(0));
  const best = (p: Product) => {
    const code = bestMatch(p, index, boost);
    return code ? db.byCode.get(code)!.nameEn : undefined;
  };

  it('finds the plain food from categories and the product name, in English or German', () => {
    expect(best(product('GiOTTO Haselnuss', 'Ferrero', ['Snacks', 'Sweet snacks', 'Confectioneries', 'Chocolate candies', 'Filled chocolates', 'Pralines']))).toMatch(/^Pralines/);
    // "Rolled oats" alone has no BLS name; with "Haferflocken" it lands on oat flakes, not sweetened cereal flakes.
    expect(best(product('Bio Haferflocken zart', 'Alnatura', ['Cereals and their products', 'Breakfast cereals', 'Flakes', 'Rolled flakes', 'Cereal flakes', 'Rolled oats']))).toBe('Oat flakes');
    expect(best(product('Milch 1,5%', 'Weihenstephan', ['Dairies', 'Milks', 'Semi-skimmed milks', 'Pasteurised milks']))).toMatch(/1\.5 % fat/);
    expect(best(product('Räucherlachs', 'Gut Bio', ['Seafood', 'Fishes', 'Salmons', 'Smoked fishes', 'Smoked salmons']))).toBe('Salmon smoked');
    expect(best(product('Erdnussbutter Crunchy', 'Ültje', ['Plant-based foods', 'Spreads', 'Nut butters', 'Peanut butters']))).toBe('Peanut butter');
    expect(best(product('Tofu natur', 'Taifun', ['Plant-based foods', 'Legumes', 'Meat alternatives', 'Tofu']))).toBe('Tofu');
  });

  it('picks nothing when nothing fits well enough', () => {
    expect(best(product('Whey Protein Vanilla', 'ESN', ['Dietary supplements', 'Bodybuilding supplements', 'Protein powders']))).toBeUndefined();
    expect(best(product('Protein Pudding Schoko', 'Ehrmann', []))).toBeUndefined();
  });

  it('pairs only products that have no similar food and no "label only"', () => {
    const giotto = product('GiOTTO Haselnuss', 'Ferrero', ['Pralines']);
    const chosen = product('Pralinen', '', ['Pralines'], { id: 'OFF:2', match: { version: '4.0', code: 'S610000' } });
    const labelOnly = product('Pralinen', '', ['Pralines'], { id: 'OFF:3', labelOnly: true });
    const usda = product('Pralines', '', ['Pralines'], { id: 'USDA:4', source: 'USDA', usdaType: 'SR Legacy' });
    expect([giotto, chosen, labelOnly, usda].map(wantsAutoMatch)).toEqual([true, false, false, false]);
    const picks = autoMatches([giotto, chosen, labelOnly, usda], index, '4.0', boost);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ id: giotto.id, match: { version: '4.0' } });
  });

  it('starts sheets from the saved choice, else the app pick, and saves the choice back', () => {
    const giotto = product('GiOTTO Haselnuss', 'Ferrero', ['Pralines']);
    const pick = initialChoice(giotto, db, index, boost);
    expect(pick.auto).toBe(true);
    expect(pick.food?.nameEn).toMatch(/^Pralines/);
    expect(withChoice(giotto, pick, '4.0').match).toEqual({ version: '4.0', code: pick.food!.code, auto: true });
    // The user picks one: no longer the app's guess.
    expect(withChoice(giotto, { food: pick.food!, auto: false }, '4.0').match).toEqual({ version: '4.0', code: pick.food!.code });
    // The user chooses none: remembered, so the app does not pair it again.
    const none = withChoice(giotto, { auto: false }, '4.0');
    expect(none.match).toBeUndefined();
    expect(none.labelOnly).toBe(true);
    expect(initialChoice(none, db, index, boost)).toEqual({ auto: false });
    const saved = withChoice(giotto, { food: db.byCode.get('S361000')!, auto: false }, '4.0');
    expect(initialChoice(saved, db, index, boost)).toEqual({ food: db.byCode.get('S361000'), auto: false });
  });
});
