import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlsFile } from './blsTypes';
import { buildFoodDb } from './foodDb';
import { INGREDIENT_FOODS, ingredientFoods } from './ingredientFoods';

const file = resolve(__dirname, '../../public/data/bls-4.0.json');
describe.runIf(existsSync(file))('ingredient foods', () => {
  const db = buildFoodDb(JSON.parse(readFileSync(file, 'utf8')) as BlsFile);

  it('points every Open Food Facts ingredient at a BLS food that exists', () => {
    const missing = Object.entries(INGREDIENT_FOODS).flatMap(([id, f]) => (typeof f === 'string' ? [f] : [...f]).filter((c) => !db.byCode.has(c)).map((c) => `${id} → ${c}`));
    expect(missing).toEqual([]);
  });

  it('gives a cooked form that has less energy than the raw one', () => {
    for (const [id] of Object.entries(INGREDIENT_FOODS)) {
      const [raw, cooked] = ingredientFoods(id)!;
      if (raw === cooked) continue;
      expect(db.byCode.get(cooked)!.per100.ENERCC as number, id).toBeLessThan(db.byCode.get(raw)!.per100.ENERCC as number);
    }
  });
});
