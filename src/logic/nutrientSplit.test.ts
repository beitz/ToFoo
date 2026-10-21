import { describe, expect, it } from 'vitest';
import { buildFoodDb } from '../foods/foodDb';
import type { BlsFile } from '../foods/blsTypes';
import type { Recipe } from '../storage/types';
import { portionIntake } from './recipeIdeas';
import { ingredientPieces, splitNutrient } from './nutrientSplit';
import type { ResolveContext } from './resolve';

describe('splitNutrient', () => {
  const piece = (name: string, intake: Record<string, number>, missing: string[] = []) => ({ name, intake, missing });

  it('gives each part its amount and share of the whole, biggest first', () => {
    const s = splitNutrient([piece('lentils', { VITK: 10 }), piece('spinach', { VITK: 290 }), piece('onion', { VITK: 0 })], 'VITK');
    expect(s.total).toBe(300);
    expect(s.rows.map((r) => [r.piece.name, r.amount, Math.round(r.share * 100)])).toEqual([
      ['spinach', 290, 97],
      ['lentils', 10, 3],
    ]);
    expect(s.none.map((p) => p.name)).toEqual(['onion']);
    expect(s.noData).toEqual([]);
  });

  it('keeps parts without data apart from parts with none (missing is not zero)', () => {
    const s = splitNutrient([piece('spinach', { VITK: 290 }), piece('product', {}, ['VITK']), piece('curry', { VITK: 20 }, ['VITK'])], 'VITK');
    expect(s.noData.map((p) => p.name)).toEqual(['product']);
    // A recipe portion with some data: counted, but marked as possibly more.
    expect(s.rows.map((r) => [r.piece.name, r.partial])).toEqual([
      ['spinach', false],
      ['curry', true],
    ]);
  });

  it('has no shares when nothing gives any', () => {
    const s = splitNutrient([piece('water', { VITK: 0 })], 'VITK');
    expect(s.total).toBe(0);
    expect(s.rows).toEqual([]);
  });
});

describe('ingredientPieces', () => {
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
      { id: 'ID', nameEn: 'Iodide', nameDe: 'Iodid', unit: 'µg' },
      { id: 'FE', nameEn: 'Iron', nameDe: 'Eisen', unit: 'mg' },
    ],
    foods: [
      ['R111000', 'Speisesalz', 'Salt', [0, null], '--'],
      ['R114000', 'Jodsalz', 'Iodised salt', [2000, null], '--'],
      ['H700000', 'Linsen', 'Lentils', [1, 8], 'AA'],
      ['G100000', 'Spinat', 'Spinach', [null, 4], 'AA'],
    ],
  };
  const ctx: ResolveContext = { foods: buildFoodDb(bls), products: new Map(), batches: new Map(), customFoods: new Map(), salt: { iodised: true, fluoridated: false } };
  const recipe: Pick<Recipe, 'name' | 'portions' | 'ingredients'> = {
    name: 'Lentil soup',
    portions: 4,
    ingredients: [
      { ref: { source: 'BLS', version: '4.0', code: 'H700000' }, name: 'Linsen', grams: 400, preparation: 'asListed' },
      { ref: { source: 'BLS', version: '4.0', code: 'G100000' }, name: 'Spinat', grams: 200, preparation: 'asListed' },
      { ref: { source: 'BLS', version: '4.0', code: 'R111000' }, name: 'Salz', grams: 8, preparation: 'asListed', isSalt: true },
      { ref: { source: 'BLS', version: '4.0', code: 'X000000' }, name: 'Gone', grams: 50, preparation: 'asListed' },
    ],
  };

  it('gives each ingredient its part of one portion, adding up to the portion', () => {
    const pieces = ingredientPieces(recipe, ctx);
    expect(pieces.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    // Salt follows the profile's choice (iodised).
    expect(pieces[2]!.code).toBe('R114000');
    // A food no longer there resolves to nothing.
    expect(pieces[3]!.code).toBeUndefined();
    const fe = splitNutrient(pieces, 'FE');
    expect(fe.rows.map((r) => [r.piece.label, r.amount])).toEqual([
      ['Lentils', 8],
      ['Spinach', 2],
    ]);
    expect(fe.total).toBeCloseTo(portionIntake(recipe, ctx).intake.FE!);
    const iodine = splitNutrient(pieces, 'ID');
    expect(iodine.rows.map((r) => r.piece.label)).toEqual(['Iodised salt', 'Lentils']);
    expect(iodine.noData.map((p) => p.label)).toEqual(['Spinach', 'Gone']);
  });
});
